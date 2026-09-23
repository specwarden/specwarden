import { describe, expect, it } from 'vitest';

import { InMemoryFileSource, type IVerdict, errorsOf, runCheck } from 'specwarden';
import { buildOrder, buildOrderFollowsDeps, violationsFor, workspaceDeps } from './build-order-follows-deps.check';

/**
 * The two broken container files below are the two shapes the defect takes: one never
 * builds its dependency at all, the other builds it a line too late. Both compile locally,
 * where every `dist` already exists, and both fail in a clean image.
 */
const BUILD = String.raw`--filter\s+(@org\/[a-z0-9-]+)\s+run\s+build`;

/** contracts imports i18n; nothing imports contracts. */
const GRAPH = new Map([
  ['@org/contracts', ['@org/i18n']],
  ['@org/i18n', []],
]);

const NEVER_BUILDS_DEPENDENCY = `FROM node:24-alpine AS builder
RUN echo "ignore-scripts=true" >> .npmrc \\
    && pnpm install --frozen-lockfile --filter web... \\
    && pnpm --filter @org/contracts run build
`;

const BUILDS_DEPENDENCY_LATE = `FROM node:24-alpine AS builder
RUN pnpm --filter @org/contracts run build
RUN pnpm --filter @org/i18n run build
`;

const CORRECT = `FROM node:24-alpine AS builder
RUN pnpm --filter @org/i18n run build \\
    && pnpm --filter @org/contracts run build
`;

const MANIFESTS = {
  'packages/contracts/package.json': JSON.stringify({
    name: '@org/contracts',
    dependencies: { '@org/i18n': 'workspace:*' },
  }),
  'packages/i18n/package.json': JSON.stringify({ name: '@org/i18n' }),
};

const graphOf = (tree: Record<string, string>) => {
  const files = new InMemoryFileSource(tree, '');
  return workspaceDeps(
    (p) => files.tryRead(p),
    (p) => files.list(p),
    'packages',
    '@org/',
  );
};

describe('buildOrder', () => {
  it('reads builds in execution order, across both RUN forms', () => {
    // A `&&` chain and separate RUN lines both execute top to bottom, so reading the file
    // in order reads the execution order either way.
    expect(buildOrder(CORRECT, BUILD)).toEqual(['@org/i18n', '@org/contracts']);
    expect(buildOrder(BUILDS_DEPENDENCY_LATE, BUILD)).toEqual(['@org/contracts', '@org/i18n']);
  });

  it('counts a package built twice at its FIRST build', () => {
    expect(buildOrder(`${CORRECT}RUN pnpm --filter @org/i18n run build\n`, BUILD)).toEqual([
      '@org/i18n',
      '@org/contracts',
    ]);
  });

  it('finds nothing in a file that builds no workspace package', () => {
    expect(buildOrder('FROM nginx:alpine\nCOPY dist /usr/share/nginx/html\n', BUILD)).toEqual([]);
  });

  it('ignores an invocation pattern that captures nothing, rather than recording `undefined`', () => {
    expect(buildOrder(CORRECT, String.raw`--filter\s+@org\/[a-z0-9-]+\s+run\s+build|(unused)`)).toEqual([]);
  });
});

describe('violationsFor', () => {
  it('reports a dependency that is never built', () => {
    expect(violationsFor(buildOrder(NEVER_BUILDS_DEPENDENCY, BUILD), GRAPH)).toEqual([
      'builds @org/contracts but never builds @org/i18n, which @org/contracts imports',
    ]);
  });

  it('reports a dependency built too late, and says to swap', () => {
    expect(violationsFor(buildOrder(BUILDS_DEPENDENCY_LATE, BUILD), GRAPH)).toEqual([
      'builds @org/contracts before @org/i18n, which @org/contracts imports — swap the two',
    ]);
  });

  it('is silent on the correct order', () => {
    expect(violationsFor(buildOrder(CORRECT, BUILD), GRAPH)).toEqual([]);
  });

  it('accepts an image that builds ONLY the dependency', () => {
    expect(violationsFor(['@org/i18n'], GRAPH)).toEqual([]);
  });

  /** A new package reaching a container file before the graph knows it must not fail a
   * build: the manifest is the source of truth and will carry it as soon as it exists. */
  it('says nothing about a package the graph has never heard of', () => {
    expect(violationsFor(['@org/unknown'], GRAPH)).toEqual([]);
  });
});

describe('workspaceDeps', () => {
  it('reads the graph from the manifests, keeping only in-scope dependencies, dev ones included', () => {
    const graph = graphOf({
      'packages/contracts/package.json': JSON.stringify({
        name: '@org/contracts',
        dependencies: { '@org/i18n': 'workspace:*', zod: '^3' },
        devDependencies: { '@org/test-kit': 'workspace:*' },
      }),
      'packages/i18n/package.json': JSON.stringify({ name: '@org/i18n' }),
    });

    expect(graph.get('@org/contracts')).toEqual(['@org/i18n', '@org/test-kit']);
    expect(graph.get('@org/i18n')).toEqual([]);
  });

  it('skips a manifest it cannot parse rather than crashing the run', () => {
    expect(graphOf({ 'packages/broken/package.json': '{ not json' }).size).toBe(0);
  });

  it('skips a folder with no manifest, and a manifest with no name', () => {
    const graph = graphOf({
      'packages/docs/README.md': '# docs',
      'packages/anonymous/package.json': JSON.stringify({ private: true }),
      ...MANIFESTS,
    });

    expect([...graph.keys()].sort()).toEqual(['@org/contracts', '@org/i18n']);
  });
});

describe('buildOrderFollowsDeps', () => {
  const check = buildOrderFollowsDeps({
    id: 'workspace-build-order',
    title: 'build order follows dependencies',
    packagesDir: 'packages',
    scopePrefix: '@org/',
    containerFiles: '**/*Dockerfile*',
    buildInvocation: BUILD,
    when: () => true,
  });

  const runOver = (extra: Record<string, string>, tracked?: readonly string[]): Promise<IVerdict> =>
    runCheck(check, { tree: { ...MANIFESTS, ...extra }, tracked });

  it('is a product-zone, read-only check', () => {
    expect(check).toMatchObject({ zone: 'product', capabilities: ['read'], tier: 'fast' });
  });

  it('passes when every build follows its dependencies, naming the scope it checked', async () => {
    const verdict = await runOver({ Dockerfile: CORRECT });

    expect(verdict).toEqual({
      ok: true,
      findings: [{ severity: 'info', message: '✓ every @org/* build follows its dependencies' }],
    });
  });

  it('names the file and the fix when one does not', async () => {
    const verdict = await runOver({ 'web/Dockerfile': BUILDS_DEPENDENCY_LATE });

    expect(verdict.ok).toBe(false);
    expect(verdict.findings[0]?.file).toBe('web/Dockerfile');
    expect(errorsOf(verdict)).toEqual([
      'web/Dockerfile: builds @org/contracts before @org/i18n, which @org/contracts imports — swap the two',
    ]);
  });

  it('reads only the container files the pathspec selects', async () => {
    // A broken build order in a file that is not a container file is some other tool's.
    expect((await runOver({ 'docs/build.md': BUILDS_DEPENDENCY_LATE, Dockerfile: CORRECT })).ok).toBe(true);
  });

  it('skips a container file that builds no workspace package, and one it cannot read', async () => {
    const verdict = await runOver({ 'nginx.Dockerfile': 'FROM nginx:alpine\n' }, [
      ...Object.keys(MANIFESTS),
      'nginx.Dockerfile',
      'deleted.Dockerfile',
    ]);

    expect(verdict.ok).toBe(true);
  });

  /**
   * The silent-pass path: with no graph every ordering is vacuously fine, so a moved
   * packages directory or a changed scope would report a clean tree it never examined.
   */
  it('fails when it read no manifests at all', async () => {
    const verdict = await runCheck(check, { tree: { Dockerfile: BUILDS_DEPENDENCY_LATE } });

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)).toEqual([
      'no workspace packages found under packages with prefix @org/ — this check compared nothing',
    ]);
  });

  it('fails when the manifests exist but none carries the configured scope', async () => {
    // The packages were renamed from `@org/` to `@acme/` and the check was not: it read
    // manifests, so it was not "empty", and it compared every build against nothing.
    const verdict = await runCheck(check, {
      tree: {
        'packages/contracts/package.json': JSON.stringify({ name: '@acme/contracts' }),
        Dockerfile: BUILDS_DEPENDENCY_LATE,
      },
    });

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)[0]).toContain('this check compared nothing');
  });
});
