import { describe, expect, it } from 'vitest';

import { InMemoryFileSource, type IVerdict, errorsOf, runCheck } from 'specwarden';
import { buildSequence, buildOrder, violationsFor, workspaceDeps } from './build-order.check';

/**
 * The two broken container files below are the two shapes the defect takes: one never
 * builds its dependency at all, the other builds it a line too late. Both compile locally,
 * where every `dist` already exists, and both fail in a clean image.
 */
const BUILD = /--filter\s+(@org\/[a-z0-9-]+)\s+run\s+build/;

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

describe('buildSequence', () => {
  it('reads builds in execution order, across both RUN forms', () => {
    // A `&&` chain and separate RUN lines both execute top to bottom, so reading the file
    // in order reads the execution order either way.
    expect(buildSequence(CORRECT, BUILD)).toEqual(['@org/i18n', '@org/contracts']);
    expect(buildSequence(BUILDS_DEPENDENCY_LATE, BUILD)).toEqual(['@org/contracts', '@org/i18n']);
  });

  it('counts a package built twice at its FIRST build', () => {
    expect(buildSequence(`${CORRECT}RUN pnpm --filter @org/i18n run build\n`, BUILD)).toEqual([
      '@org/i18n',
      '@org/contracts',
    ]);
  });

  it('finds nothing in a file that builds no workspace package', () => {
    expect(buildSequence('FROM nginx:alpine\nCOPY dist /usr/share/nginx/html\n', BUILD)).toEqual([]);
  });

  it('ignores an invocation pattern that captures nothing, rather than recording `undefined`', () => {
    expect(buildSequence(CORRECT, /--filter\s+@org\/[a-z0-9-]+\s+run\s+build|(unused)/)).toEqual([]);
  });
});

describe('violationsFor', () => {
  it('reports a dependency that is never built', () => {
    expect(violationsFor(buildSequence(NEVER_BUILDS_DEPENDENCY, BUILD), GRAPH)).toEqual([
      'builds @org/contracts but never builds @org/i18n, which @org/contracts imports — build @org/i18n first.',
    ]);
  });

  it('reports a dependency built too late, and says to swap', () => {
    expect(violationsFor(buildSequence(BUILDS_DEPENDENCY_LATE, BUILD), GRAPH)).toEqual([
      'builds @org/contracts before @org/i18n, which @org/contracts imports — swap the two.',
    ]);
  });

  it('is silent on the correct order', () => {
    expect(violationsFor(buildSequence(CORRECT, BUILD), GRAPH)).toEqual([]);
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

describe('buildOrder', () => {
  const OPTIONS = {
    title: 'build order follows dependencies',
    packagesDir: 'packages',
    scopePrefix: '@org/',
    containerFiles: '**/*Dockerfile*',
    buildInvocation: BUILD,
    when: () => true,
  };
  const check = buildOrder(OPTIONS);

  const runOver = (extra: Record<string, string>, tracked?: readonly string[]): Promise<IVerdict> =>
    runCheck(check, { tree: { ...MANIFESTS, ...extra }, tracked });

  it('is a product-zone, read-only check', () => {
    expect(check).toMatchObject({ zone: 'product', capabilities: ['read'], tier: 'fast' });
  });

  it('passes when every build follows its dependencies, naming the scope it checked', async () => {
    const verdict = await runOver({ Dockerfile: CORRECT });

    expect(verdict).toEqual({
      ok: true,
      findings: [
        { severity: 'info', message: '✓ build-order — 1 container file(s) examined, clean', ruleId: 'build-order' },
      ],
      measured: 0,
    });
  });

  it('names the file and the fix when one does not', async () => {
    const verdict = await runOver({ 'web/Dockerfile': BUILDS_DEPENDENCY_LATE });

    expect(verdict.ok).toBe(false);
    expect(verdict.findings[0]?.file).toBe('web/Dockerfile');
    expect(errorsOf(verdict)).toEqual([
      'web/Dockerfile: builds @org/contracts before @org/i18n, which @org/contracts imports — swap the two.',
    ]);
    // …on the line of the build that came too early.
    expect(verdict.findings[0]?.line).toBe(2);
  });

  it('reads only the container files the pathspec selects', async () => {
    // A broken build order in a file that is not a container file is some other tool's.
    expect((await runOver({ 'docs/build.md': BUILDS_DEPENDENCY_LATE, Dockerfile: CORRECT })).ok).toBe(true);
  });

  it('skips a container file that builds no workspace package, and one it cannot read', async () => {
    const verdict = await runOver({ 'nginx.Dockerfile': 'FROM nginx:alpine\n', Dockerfile: CORRECT }, [
      ...Object.keys(MANIFESTS),
      'Dockerfile',
      'nginx.Dockerfile',
      'deleted.Dockerfile',
    ]);

    expect(verdict.ok).toBe(true);
    expect(verdict.findings[0]?.message).toBe('✓ build-order — 1 container file(s) examined, clean');
  });

  /**
   * It passed: a pathspec that matched no container file, or files in which the invocation
   * matched nothing, judged every ordering over no build at all — and said it was clean.
   */
  it('fails when no container file runs a build the invocation matches — the corpus floor', async () => {
    const verdict = await runOver({ 'nginx.Dockerfile': 'FROM nginx:alpine\n' });

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)[0]).toContain(
      'examined 0 container file(s) — no file `**/*Dockerfile*` matches runs a build `buildInvocation` matches — below the floor of 1.',
    );
    const expected = buildOrder({ ...OPTIONS, corpus: { atLeast: 0 } });
    expect((await runCheck(expected, { tree: { ...MANIFESTS } })).ok).toBe(true);
  });

  it('honours `ratchet` and the stored threshold', async () => {
    const armed = buildOrder({ ...OPTIONS, ratchet: 1 });
    const tree = { ...MANIFESTS, Dockerfile: BUILDS_DEPENDENCY_LATE };

    expect((await runCheck(armed, { tree })).ok).toBe(true);
    expect((await runCheck(armed, { tree, threshold: 0 })).ok).toBe(false);
  });

  /**
   * The silent-pass path: with no graph every ordering is vacuously fine, so a moved
   * packages directory or a changed scope would report a clean tree it never examined.
   */
  it('fails when it read no manifests at all', async () => {
    const verdict = await runCheck(check, { tree: { Dockerfile: BUILDS_DEPENDENCY_LATE } });

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)).toEqual([
      'no workspace package under packages is named @org/… — point `packagesDir` at where the manifests are, and `scopePrefix` at the scope their names carry.',
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
    expect(errorsOf(verdict)[0]).toContain('no workspace package under packages is named @org/…');
  });
});
