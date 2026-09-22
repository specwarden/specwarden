import { describe, expect, it } from 'vitest';

import type { IProcessResult, IProcessRunner } from '../../domain';
import { GitVcs } from './git-vcs.adapter';

/** A process runner that answers a scripted result per joined command, and records
 * the commands it was asked to run, so the test can assert BOTH the parse and the
 * exact git invocation. */
function fakeRunner(responses: Record<string, IProcessResult>): {
  runner: IProcessRunner;
  calls: string[];
} {
  const calls: string[] = [];
  const runner: IProcessRunner = {
    run(command, args) {
      const key = [command, ...args].join(' ');
      calls.push(key);
      return responses[key] ?? { status: 1, stdout: '', stderr: 'unscripted' };
    },
  };
  return { runner, calls };
}

const ok = (stdout: string): IProcessResult => ({ status: 0, stdout, stderr: '' });
const fail = (): IProcessResult => ({ status: 1, stdout: '', stderr: '' });

describe('GitVcs', () => {
  it('refExists is true only when rev-parse succeeds', () => {
    const { runner } = fakeRunner({
      'git rev-parse --verify --quiet refs/heads/dev': ok('abc123'),
    });
    const vcs = new GitVcs(runner, '/repo');
    expect(vcs.refExists('refs/heads/dev')).toBe(true);
    expect(vcs.refExists('refs/heads/gone')).toBe(false);
  });

  it('remoteBranches strips the remote prefix and drops the HEAD alias', () => {
    const { runner } = fakeRunner({
      'git branch -r --format=%(refname:short)': ok('origin/HEAD -> origin/dev\norigin/dev\norigin/stage\n'),
    });
    const vcs = new GitVcs(runner, '/repo');
    expect(vcs.remoteBranches()).toEqual(['dev', 'stage']);
  });

  it('branchNames unions local heads and remotes, in full and short form; undefined when empty', () => {
    const { runner } = fakeRunner({
      'git for-each-ref --format=%(refname:short) refs/heads refs/remotes': ok('dev\norigin/dev\norigin/feature-x\n'),
    });
    const vcs = new GitVcs(runner, '/repo');
    const names = vcs.branchNames();
    expect(names).toContain('dev'); // local head, short of origin/dev
    expect(names).toContain('origin/dev'); // full remote
    expect(names).toContain('feature-x'); // short of origin/feature-x
    expect(new Set(names).size).toBe(names?.length); // deduped

    const none = new GitVcs(fakeRunner({ 'git for-each-ref --format=%(refname:short) refs/heads refs/remotes': ok('') }).runner, '/repo');
    expect(none.branchNames()).toBeUndefined(); // no refs → cannot tell
  });

  it('currentBranch is undefined on detached HEAD', () => {
    const detached = new GitVcs(fakeRunner({ 'git rev-parse --abbrev-ref HEAD': ok('HEAD') }).runner, '/repo');
    expect(detached.currentBranch()).toBeUndefined();
    const onBranch = new GitVcs(fakeRunner({ 'git rev-parse --abbrev-ref HEAD': ok('feature') }).runner, '/repo');
    expect(onBranch.currentBranch()).toBe('feature');
  });

  it('changedFiles(base) diffs base...HEAD', () => {
    const { runner, calls } = fakeRunner({
      'git diff --name-only origin/dev...HEAD': ok('a.ts\nb.ts\n'),
    });
    const vcs = new GitVcs(runner, '/repo');
    expect(vcs.changedFiles('origin/dev')).toEqual(['a.ts', 'b.ts']);
    expect(calls).toContain('git diff --name-only origin/dev...HEAD');
  });

  it('changedFiles() without a base uses the unpushed range (oldest^..HEAD)', () => {
    const { runner } = fakeRunner({
      'git rev-list HEAD --not --remotes': ok('newsha\noldsha\n'),
      'git diff --name-only oldsha^ HEAD': ok('x.ts\n'),
    });
    const vcs = new GitVcs(runner, '/repo');
    expect(vcs.changedFiles()).toEqual(['x.ts']);
  });

  it('changedFiles() returns [] when nothing is unpushed, undefined when git fails', () => {
    const empty = new GitVcs(fakeRunner({ 'git rev-list HEAD --not --remotes': ok('') }).runner, '/repo');
    expect(empty.changedFiles()).toEqual([]);
    const broken = new GitVcs(fakeRunner({ 'git rev-list HEAD --not --remotes': fail() }).runner, '/repo');
    expect(broken.changedFiles()).toBeUndefined();
  });

  it('changedLineCount sums added + deleted over the same range', () => {
    const { runner, calls } = fakeRunner({
      'git diff --numstat origin/dev...HEAD': ok('10\t4\ta.ts\n1\t0\tb.ts\n'),
    });
    const vcs = new GitVcs(runner, '/repo');
    expect(vcs.changedLineCount('origin/dev')).toBe(15);
    expect(calls).toContain('git diff --numstat origin/dev...HEAD');
  });

  it('changedLineCount uses the unpushed range when no base is given — the same one changedFiles reads', () => {
    const { runner } = fakeRunner({
      'git rev-list HEAD --not --remotes': ok('newsha\noldsha\n'),
      'git diff --numstat oldsha^ HEAD': ok('3\t2\tx.ts\n'),
      'git diff --name-only oldsha^ HEAD': ok('x.ts\n'),
    });
    const vcs = new GitVcs(runner, '/repo');
    expect(vcs.changedLineCount()).toBe(5);
    expect(vcs.changedFiles()).toEqual(['x.ts']);
  });

  /**
   * A binary file has no line count. Reading git's `-` as a number would make it
   * NaN and poison the total, which either arms a full run on nothing or disarms it
   * — and both look identical from outside.
   */
  it('changedLineCount ignores binary files rather than guessing at them', () => {
    const { runner } = fakeRunner({
      'git diff --numstat origin/dev...HEAD': ok('-\t-\tlogo.png\n7\t1\ta.ts\n'),
    });
    expect(new GitVcs(runner, '/repo').changedLineCount('origin/dev')).toBe(8);
  });

  it('changedLineCount is 0 with nothing unpushed and undefined when git fails', () => {
    const empty = new GitVcs(fakeRunner({ 'git rev-list HEAD --not --remotes': ok('') }).runner, '/repo');
    expect(empty.changedLineCount()).toBe(0);
    const broken = new GitVcs(fakeRunner({ 'git rev-list HEAD --not --remotes': fail() }).runner, '/repo');
    expect(broken.changedLineCount()).toBeUndefined();
    // The diff itself failing is also "cannot tell", never a zero that reads as "small".
    const noDiff = new GitVcs(fakeRunner({}).runner, '/repo');
    expect(noDiff.changedLineCount('origin/dev')).toBeUndefined();
  });
});
