import { describe, expect, it } from 'vitest';

import { InMemoryFileSource } from '../../../infrastructure';
import { adopt } from './adopt.command';

function run(tree: Record<string, string>) {
  let out = '';
  let err = '';
  const io = { out: (t: string) => (out += t), err: (t: string) => (err += t) };
  const code = adopt(new InMemoryFileSource(tree), io);
  return { code, out, err };
}

/**
 * `adopt` is the first thing a newcomer runs. Its whole value is that each line is
 * TRUE: a guess dressed as a finding ("package manager: npm" because nothing else
 * matched) is worse than "unknown", because the reader then acts on it.
 */
describe('adopt on a repository it knows nothing about', () => {
  it('says "unknown" and "none" for every field, rather than guessing, and exits 0', () => {
    const r = run({});
    expect(r.code).toBe(0);
    expect(r.out).toContain('package manager : unknown\n');
    expect(r.out).toContain('workspaces      : none\n');
    expect(r.out).toContain('test runner     : unknown\n');
    expect(r.out).toContain('agent router    : none\n');
    expect(r.out).toContain('doc directories : none\n');
    expect(r.err).toBe('');
  });
});

describe('adopt on a repository with a shape', () => {
  it('reports each field it detected, workspaces and doc directories comma-joined', () => {
    const r = run({
      'pnpm-lock.yaml': '',
      'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - 'libs/*'\n",
      'package.json': '{ "devDependencies": { "jest": "^29" } }',
      'CLAUDE.md': '# router',
      'docs/a.md': '#',
      'doc/b.md': '#',
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain('package manager : pnpm\n');
    // The globs, and how many packages they match — here none carries a manifest.
    expect(r.out).toContain('workspaces      : apps/*, libs/* (0 packages)\n');
    expect(r.out).toContain('test runner     : jest\n');
    expect(r.out).toContain('agent router    : present\n');
    expect(r.out).toContain('doc directories : docs, doc\n');
  });

  // It said nothing of the CI workflow, the documents or the compose file — each changes
  // what `init` writes, so the report and the tree disagreed about the repository.
  it('reports every fact init acts on: CI and its workflows, documents, specs, compose, proxy, shell', () => {
    const r = run({
      'package.json': JSON.stringify({ scripts: { test: 'node --test' } }),
      'README.md': '# a',
      'docs/guide.md': '#',
      '.github/workflows/deploy.yml': 'on: push',
      '.github/workflows/ci.yml': 'on: push',
      'openspec/specs/a/spec.md': '#',
      'compose.yaml': 'services: {}',
      'deploy/Caddyfile': 'x',
      'scripts/release.sh': 'echo',
    });
    for (const line of [
      'test runner     : node:test\n',
      'ci              : github actions — .github/workflows/ci.yml, .github/workflows/deploy.yml\n',
      'documents       : 3 markdown file(s), README.md among them\n',
      'specs           : openspec\n',
      'compose         : compose.yaml\n',
      'proxy configs   : deploy/Caddyfile\n',
      'shell scripts   : present\n',
    ])
      expect(r.out).toContain(line);
  });

  it('names a runner it cannot name by its script', () => {
    expect(run({ 'package.json': JSON.stringify({ scripts: { test: 'ava' } }) }).out).toContain(
      'test runner     : other — `ava`\n',
    );
  });

  it('ends by naming the next command and saying nothing was enabled', () => {
    const r = run({});
    expect(r.out).toContain('specwarden suggest');
    expect(r.out).toContain('Nothing is enabled for you.');
  });

  it('points at the checks folder, never at the config — which before init does not exist', () => {
    // "copy the ones you confirm into .specwarden/warden.config.mjs": a check is a file
    // under checks/, and adopt runs before init has written any config at all.
    const r = run({});
    expect(r.out).not.toContain('warden.config.mjs');
    expect(r.out).toContain('specwarden init');
    expect(r.out).toContain('checks folder');
  });
});
