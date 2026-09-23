/**
 * A plan — the ordered work for a piece of change, as a readable artifact that
 * stays the source of truth (never a derivative of a tracker). Three declared states,
 * and the distinctions are load-bearing: a `draft` claims nothing about the past and
 * never goes stale however long it sits; an `active` declares a branch that must exist,
 * and a vanished branch means the work merged; a `done` plan says so itself, and is
 * waiting to be harvested and archived. A draft may NOT name a branch — a reservation
 * there arms a false-past failure the day someone tidies it.
 *
 * ONE VOCABULARY. The engine read `draft | active`, the plans module `draft | active |
 * done`, so a finished plan was reported by `plan status` as a draft that declared no
 * status at all.
 */
export type TPlanStatus = 'draft' | 'active' | 'done';
export const PLAN_STATUSES = ['draft', 'active', 'done'] as const;

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
