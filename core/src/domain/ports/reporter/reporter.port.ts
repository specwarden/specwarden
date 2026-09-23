import type { ICheckMeta, ICheckResult } from '../../check/check.model';

/**
 * The output port. The engine's ONE writer to a host's console — checks return
 * verdicts, the reporter renders them, and it decides nothing about pass/fail.
 * Two adapters implement it: a TTY reporter for a human and a JSON reporter for a
 * machine, the same run readable both ways.
 *
 * Contractual invariant, pinned by the adapter tests: a reporter never prints the
 * VALUE of an environment variable. A finding names what is wrong, not the secret
 * behind it, and the renderer must not widen that.
 */
export interface IReporter {
  /** A check is about to run. */
  checkStarted(meta: ICheckMeta): void;
  /** A check finished (or was skipped). */
  checkFinished(result: ICheckResult): void;
  /** The whole run finished — the place for the closing summary line. `run` says what
   * shaped it; a reporter written before it existed ignores it. */
  runFinished(results: readonly ICheckResult[], totalMs: number, run?: IRunSummary): void;
}

/** What a reporter is told about the run as a whole, beside its results. */
export interface IRunSummary {
  /** Why relevance did not filter this run — `--all`, a shared build input, an
   * unreadable range, CI with no base — or absent when it did. A run that filtered
   * nothing and a run that filtered everything look alike without it. */
  readonly fullRunReason?: string;
}
