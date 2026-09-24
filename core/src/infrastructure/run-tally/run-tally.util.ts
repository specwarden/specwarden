import type { ICheckResult } from '../../domain';

export interface IRunTally {
  /** Checks that ran and held — advisory ones included: a check that held, held. */
  readonly passed: number;
  /** Blocking checks that did not hold. The only count that decides the exit code. */
  readonly failed: readonly ICheckResult[];
  /** Advisory checks that did not hold: reported, never blocking. */
  readonly warned: number;
  readonly skipped: number;
}

/**
 * One count of a run, for every reporter.
 *
 * Each reporter counted for itself, and they disagreed about the same run: the terminal
 * left a passing advisory check out (four passed, of five), the GitHub notice
 * counted a FAILED advisory check as passed. A summary that differs between the shell and
 * the CI log is one of them lying, and nobody can tell which.
 */
export function tallyRun(results: readonly ICheckResult[]): IRunTally {
  const active = results.filter((r) => !r.skipped);
  return {
    passed: active.filter((r) => r.verdict.ok).length,
    failed: active.filter((r) => !r.verdict.ok && !r.meta.advisory),
    warned: active.filter((r) => !r.verdict.ok && r.meta.advisory).length,
    skipped: results.length - active.length,
  };
}
