import type { IProcessRunner, IVcs } from '../../domain';

/**
 * Git behind the VCS port. It runs git through the process port rather than
 * `child_process` directly, so it is unit-testable with a fake runner and honours
 * the same capability discipline as everything else. Only reads — never a
 * mutation — and it degrades honestly: a git command that fails yields
 * `undefined`/`false`/`[]`, never a guessed answer.
 *
 * `changedFiles` and `changedLineCount` read the SAME range, computed once in
 * `range()`: with a base, the `base...HEAD` diff; without one, the commits not yet on
 * any remote (oldest new commit's parent to HEAD), which is what the pre-push hook
 * uses. Two copies of that derivation could answer about different commits, and a
 * size trigger disagreeing with the file list is the kind of defect nothing prints.
 */
export class GitVcs implements IVcs {
  constructor(
    private readonly proc: IProcessRunner,
    private readonly cwd: string,
  ) {}

  refExists(ref: string): boolean {
    return this.proc.run('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: this.cwd }).status === 0;
  }

  remoteBranches(): readonly string[] {
    const r = this.proc.run('git', ['branch', '-r', '--format=%(refname:short)'], { cwd: this.cwd });
    if (r.status !== 0) return [];
    return r.stdout
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.includes('->')) // drop `origin/HEAD -> origin/dev`
      .map((s) => s.replace(/^[^/]+\//, '')); // `origin/dev` -> `dev`
  }

  branchNames(): readonly string[] | undefined {
    const r = this.proc.run('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes'], {
      cwd: this.cwd,
    });
    if (r.status !== 0) return undefined;
    const names = this.lines(r.stdout)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .flatMap((s) => [s, s.replace(/^[^/]+\//, '')]); // both `origin/dev` and `dev`
    return names.length > 0 ? [...new Set(names)] : undefined;
  }

  currentBranch(): string | undefined {
    const r = this.proc.run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: this.cwd });
    const name = r.stdout.trim();
    if (r.status !== 0 || name === '' || name === 'HEAD') return undefined;
    return name;
  }

  changedFiles(base?: string): readonly string[] | undefined {
    const range = this.range(base);
    if (range === undefined) return undefined; // cannot tell
    if (range === null) return []; // nothing new to push
    const diff = this.proc.run('git', ['diff', '--name-only', ...range], { cwd: this.cwd });
    return diff.status === 0 ? this.lines(diff.stdout) : undefined;
  }

  changedLineCount(base?: string): number | undefined {
    const range = this.range(base);
    if (range === undefined) return undefined; // cannot tell
    if (range === null) return 0; // nothing new to push
    const diff = this.proc.run('git', ['diff', '--numstat', ...range], { cwd: this.cwd });
    if (diff.status !== 0) return undefined;

    let total = 0;
    for (const line of this.lines(diff.stdout)) {
      const [added, deleted] = line.split('\t');
      // `-\t-` is git's marker for a binary file: it has no line count, so it
      // contributes none rather than a guess. Same for anything unparseable —
      // inventing a number here would arm or disarm a full run on noise.
      const a = Number.parseInt(added, 10);
      const d = Number.parseInt(deleted, 10);
      if (!Number.isFinite(a) || !Number.isFinite(d)) continue;
      total += a + d;
    }
    return total;
  }

  /**
   * The revision range both diff readers share, so they can never answer about
   * different commits: `[base...HEAD]` when a base is given, otherwise the commits
   * not yet on any remote. `undefined` means "cannot tell", `null` means the range
   * is empty (nothing new to push).
   */
  private range(base?: string): readonly string[] | undefined | null {
    if (base !== undefined) return [`${base}...HEAD`];
    const unpushed = this.proc.run('git', ['rev-list', 'HEAD', '--not', '--remotes'], { cwd: this.cwd });
    if (unpushed.status !== 0) return undefined;
    const commits = this.lines(unpushed.stdout);
    if (commits.length === 0) return null;
    const oldest = commits[commits.length - 1];
    return [`${oldest}^`, 'HEAD'];
  }

  trackedFiles(pathspec?: string): readonly string[] {
    const args = pathspec !== undefined ? ['ls-files', pathspec] : ['ls-files'];
    const r = this.proc.run('git', args, { cwd: this.cwd });
    return r.status === 0 ? this.lines(r.stdout) : [];
  }

  private lines(out: string): string[] {
    return out.split('\n').filter((s) => s.length > 0);
  }
}
