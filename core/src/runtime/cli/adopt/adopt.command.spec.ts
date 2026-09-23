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
    expect(r.out).toContain('workspaces      : apps/*, libs/*\n');
    expect(r.out).toContain('test runner     : jest\n');
    expect(r.out).toContain('agent router    : present\n');
    expect(r.out).toContain('doc directories : docs, doc\n');
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
