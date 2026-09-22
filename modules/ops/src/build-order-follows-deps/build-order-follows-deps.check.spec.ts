import { describe, expect, it } from 'vitest';

import { InMemoryFileSource } from 'specwarden';
import { buildOrder, buildOrderFollowsDeps, violationsFor, workspaceDeps } from './build-order-follows-deps.check';

/**
 * The two container files in the cases below are real ones, as they shipped: one never
 * built its dependency at all, the other built it a line too late. Both compiled locally
 * and both failed in a clean image, which is the whole reason this check exists.
 */
const BUILD = String.raw`--filter\s+(@app\/[a-z0-9-]+)\s+run\s+build`;

/** contracts imports i18n; nothing imports contracts. */
const GRAPH = new Map([
  ['@app/contracts', ['@app/i18n']],
  ['@app/i18n', []],
]);

const NEVER_BUILDS_DEPENDENCY = `FROM node:20-alpine AS builder
RUN echo "ignore-scripts=true" >> .npmrc \\
    && pnpm install --frozen-lockfile --filter console... \\
    && pnpm --filter @app/contracts run build
`;

const BUILDS_DEPENDENCY_LATE = `FROM node:22-alpine AS builder
RUN pnpm --filter @app/contracts run build
RUN pnpm --filter @app/i18n run build
`;

const CORRECT = `FROM node:20-alpine AS builder
RUN pnpm --filter @app/i18n run build \\
    && pnpm --filter @app/contracts run build
`;

describe('buildOrder', () => {
  it('reads builds in execution order, across both RUN forms', () => {
    // A `&&` chain and separate RUN lines both execute top to bottom, so reading the file
    // in order reads the execution order either way.
    expect(buildOrder(CORRECT, BUILD)).toEqual(['@app/i18n', '@app/contracts']);
    expect(buildOrder(BUILDS_DEPENDENCY_LATE, BUILD)).toEqual(['@app/contracts', '@app/i18n']);
  });

  it('finds nothing in a file that builds no workspace package', () => {
    expect(buildOrder('FROM nginx:alpine\nCOPY dist /usr/share/nginx/html\n', BUILD)).toEqual([]);
  });
});

describe('violationsFor', () => {
  it('reports a dependency that is never built', () => {
    const problems = violationsFor(buildOrder(NEVER_BUILDS_DEPENDENCY, BUILD), GRAPH);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('never builds @app/i18n');
  });

  it('reports a dependency built too late, and says to swap', () => {
    const problems = violationsFor(buildOrder(BUILDS_DEPENDENCY_LATE, BUILD), GRAPH);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('swap the two');
  });

  it('is silent on the correct order', () => {
    expect(violationsFor(buildOrder(CORRECT, BUILD), GRAPH)).toEqual([]);
  });

  it('accepts an image that builds ONLY the dependency', () => {
    expect(violationsFor(['@app/i18n'], GRAPH)).toEqual([]);
  });

  it('never reports a package with no workspace dependencies', () => {
    expect(violationsFor(['@app/i18n', '@app/contracts'], GRAPH)).toEqual([]);
  });

  /** A new package reaching a container file before the graph knows it must not fail a
   * build: the manifest is the source of truth and will carry it as soon as it exists. */
  it('says nothing about a package the graph has never heard of', () => {
    expect(violationsFor(['@app/unknown'], GRAPH)).toEqual([]);
  });
});

describe('workspaceDeps', () => {
  it('reads the graph from the manifests, keeping only in-scope dependencies', () => {
    const files = new InMemoryFileSource(
      {
        'packages/contracts/package.json': JSON.stringify({
          name: '@app/contracts',
          dependencies: { '@app/i18n': 'workspace:*', zod: '^3' },
        }),
        'packages/i18n/package.json': JSON.stringify({ name: '@app/i18n' }),
      },
      '',
    );

    const graph = workspaceDeps(
      (p) => files.tryRead(p),
      (p) => files.list(p),
      'packages',
      '@app/',
    );

    expect(graph.get('@app/contracts')).toEqual(['@app/i18n']);
    expect(graph.get('@app/i18n')).toEqual([]);
  });

  it('skips a manifest it cannot parse rather than crashing the run', () => {
    const files = new InMemoryFileSource({ 'packages/broken/package.json': '{ not json' }, '');

    const graph = workspaceDeps(
      (p) => files.tryRead(p),
      (p) => files.list(p),
      'packages',
      '@app/',
    );

    expect(graph.size).toBe(0);
  });
});

describe('buildOrderFollowsDeps', () => {
  const check = buildOrderFollowsDeps({
    id: 'workspace-build-order',
    title: 'build order follows dependencies',
    packagesDir: 'packages',
    scopePrefix: '@app/',
    containerFiles: '*Dockerfile*',
    buildInvocation: BUILD,
    when: () => true,
  });

  const runOver = (extra: Record<string, string>) => {
    const files = new InMemoryFileSource(
      {
        'packages/contracts/package.json': JSON.stringify({
          name: '@app/contracts',
          dependencies: { '@app/i18n': 'workspace:*' },
        }),
        'packages/i18n/package.json': JSON.stringify({ name: '@app/i18n' }),
        ...extra,
      },
      '',
    );
    const vcs = { trackedFiles: () => Object.keys(extra) };
    return check.run({ files, vcs } as never);
  };

  it('passes when every build follows its dependencies', () => {
    expect(runOver({ Dockerfile: CORRECT }).ok).toBe(true);
  });

  it('names the file and the fix when one does not', () => {
    const verdict = runOver({ 'web/Dockerfile': BUILDS_DEPENDENCY_LATE });

    expect(verdict.ok).toBe(false);
    expect(verdict.findings[0]?.file).toBe('web/Dockerfile');
    expect(verdict.findings[0]?.message).toContain('swap the two');
  });

  /**
   * The silent-pass path: with no graph every ordering is vacuously fine, so a moved
   * packages directory or a changed scope would report a clean tree it never examined.
   */
  it('fails when it read no manifests at all', () => {
    const files = new InMemoryFileSource({ Dockerfile: CORRECT }, '');
    const vcs = { trackedFiles: () => ['Dockerfile'] };

    const verdict = check.run({ files, vcs } as never);

    expect(verdict.ok).toBe(false);
    expect(verdict.findings[0]?.message).toContain('compared nothing');
  });
});
