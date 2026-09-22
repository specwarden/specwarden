import { describe, expect, it } from 'vitest';

import { defineCheck } from '../../primitives';
import { MissingTestPortError, errorsOf, runCheck, testContext } from './test-context.util';

describe('testContext', () => {
  it('answers reads from the described tree', () => {
    const ctx = testContext({ tree: { 'a.md': 'A' } });

    expect(ctx.files.read('a.md')).toBe('A');
    expect(ctx.files.exists('b.md')).toBe(false);
  });

  it('reports the tree as tracked by default — the common case needs no second option', () => {
    const ctx = testContext({ tree: { 'a.md': 'A', 'docs/b.md': 'B' } });

    expect([...ctx.vcs.trackedFiles()].sort()).toEqual(['a.md', 'docs/b.md']);
  });

  it('filters the tracked set by a pathspec', () => {
    const ctx = testContext({ tree: { 'a.md': 'A', 'docs/b.md': 'B', 'docs/c.ts': 'C' } });

    expect(ctx.vcs.trackedFiles('docs/*.md')).toEqual(['docs/b.md']);
    expect(ctx.vcs.trackedFiles('**/*.md')).toEqual(['a.md', 'docs/b.md']);
  });

  it('takes an explicit tracked set, including one that differs from the tree', () => {
    const ctx = testContext({ tree: { 'a.md': 'A' }, tracked: ['ghost.md'] });

    expect(ctx.vcs.trackedFiles()).toEqual(['ghost.md']);
  });

  it('carries the changed set, the shard and the stored ratchet', () => {
    const ctx = testContext({ changed: ['a.ts'], shard: '1/3', ratchet: 7 });

    expect(ctx.changed).toEqual(['a.ts']);
    expect(ctx.shard).toBe('1/3');
    expect(ctx.ratchet).toBe(7);
  });

  it('reports `undefined` branches as "cannot tell" rather than "none"', () => {
    // The distinction a check must honour: no refs at all is a reason to skip, and an
    // empty list is a verdict. Collapsing them is how a plan check fails a first push.
    expect(testContext({ branches: null }).vcs.branchNames()).toBeUndefined();
    expect(testContext({ branches: [] }).vcs.branchNames()).toEqual([]);
  });

  // ── the refusals ───────────────────────────────────────────────────────────────

  it('refuses a subprocess by name when the test did not describe one', () => {
    const ctx = testContext();

    expect(() => ctx.proc.run('sh', ['-c', 'true'])).toThrow(MissingTestPortError);
    expect(() => ctx.proc.run('sh', ['-c', 'true'])).toThrow(/Pass `exec`/);
  });

  it('refuses the clock by name rather than racing the calendar', () => {
    expect(() => testContext().clock.now()).toThrow(/Pass `now`/);
  });

  it('answers the clock once it is pinned', () => {
    const at = new Date('2020-01-01T00:00:00Z');

    expect(testContext({ now: at }).clock.now()).toBe(at);
  });

  // ── what a test inspects afterwards ────────────────────────────────────────────

  it('records what the check wrote and what it spawned', () => {
    const ctx = testContext({ exec: () => ({ status: 0, stdout: '', stderr: '' }) });
    ctx.writer.write('out.txt', 'hello');
    ctx.proc.run('sh', ['-c', 'echo hi']);

    expect(ctx.writes.get('out.txt')).toBe('hello');
    expect(ctx.commands).toEqual([{ command: 'sh', args: ['-c', 'echo hi'] }]);
  });
});

describe('runCheck', () => {
  it('awaits an async check, so a failure cannot be missed', async () => {
    // Without the await, `verdict.ok` is `undefined` on a Promise — falsy, so an
    // assertion that the check FAILED passes against a check that never ran.
    const check = defineCheck({
      id: 'x',
      title: 'x',
      run: () => Promise.resolve([{ severity: 'error' as const, message: 'bad' }]),
    });

    const verdict = await runCheck(check);

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)).toEqual(['bad']);
  });

  it('errorsOf drops the info lines a passing run prints', async () => {
    const verdict = await runCheck(defineCheck({ id: 'x', title: 'x', run: () => [] }));

    expect(verdict.findings.length).toBeGreaterThan(0);
    expect(errorsOf(verdict)).toEqual([]);
  });
});
