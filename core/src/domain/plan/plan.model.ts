/**
 * A plan — the ordered work for a piece of change, as a readable artifact that
 * stays the source of truth (never a derivative of a tracker). Two states, and the
 * distinction is load-bearing: a `draft` claims nothing about the past and never
 * goes stale however long it sits; an `active` declares a branch that must exist,
 * and a vanished branch means the work merged. A draft may NOT name a branch — a
 * reservation there arms a false-past failure the day someone tidies it.
 */
export type TPlanStatus = 'draft' | 'active';
export const PLAN_STATUSES = ['draft', 'active'] as const;

/**
 * One phase of a plan. A phase states dependency and deployability and names an
 * acceptance command — its definition of done. It never states how much work to
 * take at once: sizing is the one number no acceptance command can verify, and it
 * belongs to whoever implements the phase.
 */
export interface IPlanPhase {
  readonly title: string;
  /** The command that proves the phase done. A phase without one has no
   * definition of done — the advisory shape check flags its absence. */
  readonly acceptance?: string;
  /** Free-text state marker for the phase (e.g. done / in progress / not started). */
  readonly state?: string;
}

export interface IPlan {
  readonly ticket?: string;
  readonly status: TPlanStatus;
  /** Present iff `status === 'active'`. Its existence among the remote-tracking
   * refs is what a staleness check verifies. */
  readonly branch?: string;
  readonly phases: readonly IPlanPhase[];
}
