import type { ICheckIdentity, TTier } from 'specwarden';

/**
 * The identity an ops check takes: the engine's, with `tier` optional.
 *
 * Every check here only reads files, so `fast` is the tier each belongs in; absent, it is
 * `fast`. And `when` is optional like everywhere else — it was REQUIRED here, typed as a
 * function and passed through untouched, so a check wired without one crashed the whole
 * pre-push run with "when is not a function" the moment relevance applied.
 */
export interface IOpsCheckIdentity extends Omit<ICheckIdentity, 'tier' | 'title'> {
  /** Absent: the rule's statement — every check here names the rule it enforces. */
  readonly title?: string;
  readonly tier?: TTier;
}
