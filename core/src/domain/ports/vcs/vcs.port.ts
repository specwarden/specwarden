/**
 * The version-control port. Only the questions a check legitimately asks — never
 * a mutation. `plan-staleness` asks whether a declared branch still exists among
 * the remote-tracking refs; the runner asks which files changed in a range. Both
 * must degrade honestly: a checkout with no refs answers `undefined` ("cannot
 * tell") rather than inventing a verdict, because a guessed answer here fails a
 * push on a machine it should not.
 */
export interface IVcs {
  /** Whether a ref (branch, tag, remote-tracking ref) resolves in this checkout. */
  refExists(ref: string): boolean;

  /** Short names of every remote-tracking branch (e.g. `dev`, not
   * `origin/dev`). Empty when the checkout has no remotes — which a caller must
   * treat as "cannot tell", not "the branch is gone". */
  remoteBranches(): readonly string[];

  /**
   * Every branch name this checkout can resolve — LOCAL heads and remote-tracking
   * refs, each in both its full (`origin/dev`) and short (`dev`) form — or
   * `undefined` when there are no refs to read at all. Local heads count on
   * purpose: a plan's branch check runs in pre-push, where on a branch's FIRST
   * push the remote ref does not exist yet, and a remote-only view would fail every
   * plan on the most ordinary action there is. `undefined` means "cannot tell", and
   * a caller must skip rather than guess a verdict. (Added in phase 6, driven by the
   * plan-staleness migration — the ports were declared temporary until then.)
   */
  branchNames(): readonly string[] | undefined;

  /** The current branch, or `undefined` in a detached HEAD. */
  currentBranch(): string | undefined;

  /**
   * Files changed for relevance filtering. With `base`, the diff of
   * `base...HEAD`; without it, the commits not yet on any remote (the range the
   * pre-push hook uses). `undefined` means the range was not computable — the
   * caller then runs everything, never nothing.
   */
  changedFiles(base?: string): readonly string[] | undefined;

  /**
   * Added + deleted lines over the SAME range `changedFiles` reports, or
   * `undefined` when the range was not computable. It is the second, deliberately
   * weaker signal behind a full run: a diff wide enough to outrun every relevance
   * predicate, when it happens to touch none of the paths that name themselves.
   *
   * Binary files contribute nothing — they have no line count — rather than being
   * guessed at, for the same reason the rest of this port degrades honestly.
   */
  changedLineCount(base?: string): number | undefined;

  /** Tracked files, optionally filtered by a pathspec (git ls-files). */
  trackedFiles(pathspec?: string): readonly string[];
}
