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

  it('an EMPTY pathspec is every tracked file, as it is to git', () => {
    // `trackedFiles(options.scan ?? '')` is the shipped shape of a check that scans the
    // whole tree. Forwarded to a glob, an empty string matches nothing — so the check
    // examines an empty corpus and reports green, inside the fixture whose whole job is
    // to prove that a check can fail. Found when a credential scan passed over a tree
    // with a credential in it.
    const ctx = testContext({ tree: { 'a.md': 'A', 'docs/b.md': 'B' } });

    expect(ctx.vcs.trackedFiles('')).toHaveLength(2);
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

  it('asks a tracked FUNCTION per pathspec, so a test can answer each question differently', () => {
    const asked: (string | undefined)[] = [];
    const ctx = testContext({
      tree: { 'a.md': 'A' },
      tracked: (pathspec) => {
        asked.push(pathspec);
        return pathspec === 'docs/**' ? ['docs/x.md'] : ['a.md'];
      },
    });

    expect(ctx.vcs.trackedFiles('docs/**')).toEqual(['docs/x.md']);
    expect(ctx.vcs.trackedFiles()).toEqual(['a.md']);
    // Handed through untouched — the function is the test's own index, not filtered again.
    expect(asked).toEqual(['docs/**', undefined]);
  });

  /**
   * The default tracked set is the tree as git would spell it. A key written with a
   * leading `./` or a backslash is still one file, and reporting it in that spelling
   * would make a check comparing tracked paths against `files.glob` see two.
   */
  it('reports tree keys in canonical spelling, dotfiles included', () => {
    const ctx = testContext({ tree: { './a.md': 'A', 'docs\\b.md': 'B', '.env': 'K=V' } });

    expect([...ctx.vcs.trackedFiles()].sort()).toEqual(['.env', 'a.md', 'docs/b.md']);
  });

  it('answers the branch questions from one described list', () => {
    const ctx = testContext({ branches: ['dev', 'main'], currentBranch: 'dev' });

    expect(ctx.vcs.refExists('main')).toBe(true);
    expect(ctx.vcs.refExists('gone')).toBe(false);
    expect(ctx.vcs.remoteBranches()).toEqual(['dev', 'main']);
    expect(ctx.vcs.branchNames()).toEqual(['dev', 'main']);
    expect(ctx.vcs.currentBranch()).toBe('dev');
  });

  it('with no branches described, no ref exists and HEAD names no branch', () => {
    const ctx = testContext();

    expect(ctx.vcs.refExists('dev')).toBe(false);
    expect(ctx.vcs.remoteBranches()).toEqual([]);
    expect(ctx.vcs.branchNames()).toEqual([]);
    expect(ctx.vcs.currentBranch()).toBeUndefined();
  });

  it('`branches: null` exists nowhere and lists nothing, while still saying "cannot tell"', () => {
    const ctx = testContext({ branches: null });

    expect(ctx.vcs.refExists('dev')).toBe(false);
    expect(ctx.vcs.remoteBranches()).toEqual([]);
    expect(ctx.vcs.branchNames()).toBeUndefined();
  });

  it('reports the changed set through vcs as well as on the context — the two must agree', () => {
    expect(testContext({ changed: ['a.ts'] }).vcs.changedFiles()).toEqual(['a.ts']);
    expect(testContext().vcs.changedFiles()).toEqual([]);
  });

  /**
   * A line count the test never described is "cannot tell", never a zero: a check that
   * arms a full run on a large diff would read 0 as "small" and skip it.
   */
  it('answers changedLineCount as "cannot tell"', () => {
    expect(testContext().vcs.changedLineCount()).toBeUndefined();
  });

  it('reports the root it was given, and a neutral one otherwise', () => {
    expect(testContext({ root: '/some/checkout' }).files.root()).toBe('/some/checkout');
    expect(testContext().files.root()).toBe('/test');
  });

  it('shows the check the roster it was given, and an empty one otherwise', () => {
    const roster = [
      { id: 'a', title: 'a', tier: 'fast' as const, zone: 'consumer' as const, capabilities: [], contractVersion: 1 },
    ];

    expect(testContext({ roster }).roster()).toBe(roster);
    expect(testContext().roster()).toEqual([]);
  });

  it('keeps a monotonic clock at zero even unpinned, since durations need no calendar', () => {
    expect(testContext().clock.monotonicMs()).toBe(0);
  });

  it('hands the exec function the command, the args and the options the check passed', () => {
    const seen: unknown[] = [];
    const ctx = testContext({
      exec: (command, args, options) => {
        seen.push({ command, args, options });
        return { status: 3, stdout: 'o', stderr: 'e' };
      },
    });

    expect(ctx.proc.run('git', ['status'], { cwd: '/x', timeoutSec: 2 })).toEqual({
      status: 3,
      stdout: 'o',
      stderr: 'e',
    });
    expect(seen).toEqual([{ command: 'git', args: ['status'], options: { cwd: '/x', timeoutSec: 2 } }]);
  });

  // ── the refusals ───────────────────────────────────────────────────────────────

  it('records a refused spawn too, so a test can see what the check reached for', () => {
    const ctx = testContext();

    expect(() => ctx.proc.run('git', ['push'])).toThrow(MissingTestPortError);
    expect(ctx.commands).toEqual([{ command: 'git', args: ['push'] }]);
  });

  it('names the refusal as a MissingTestPortError that says which port and which option', () => {
    const error = new MissingTestPortError('clock', 'now', 'now');

    expect(error.name).toBe('MissingTestPortError');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('the check called clock.now()');
    expect(error.message).toContain('Pass `now` to testContext()');
  });

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
