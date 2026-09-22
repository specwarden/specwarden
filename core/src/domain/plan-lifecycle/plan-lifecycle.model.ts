import type { TPlanStatus } from '../plan/plan.model';

/**
 * The plan lifecycle — a state MACHINE whose transitions are read from git and the
 * filesystem, never from what the document asserts about itself. That is the whole
 * point: a checkbox is a claim, a merged branch is proof.
 *
 *   draft ── branch declared ──▶ active ── branch merged/gone ──▶ spent ──▶ archived
 *
 * `draft` and `active` are the two DECLARED statuses (a draft claims nothing about
 * the past and may not name a branch); `spent` and `archived` are DERIVED — spent
 * when an active plan's branch no longer resolves (the work merged), archived when
 * the plan lives under the archive tree.
 */
export type TPlanLifecycle = 'draft' | 'active' | 'spent' | 'archived';

export interface ILifecycleInputs {
  /** The plan's declared status. */
  readonly status: TPlanStatus;
  /** Whether the plan's declared branch still resolves in the checkout, or
   * `undefined` when the checkout cannot tell (no refs) — in which case the state
   * must not be guessed as spent. */
  readonly branchExists?: boolean;
  /** Whether the plan file lives under the archive tree. */
  readonly inArchive: boolean;
}

/**
 * Compute the lifecycle state. Location wins (an archived plan is archived whatever
 * it declares); then a draft is a draft; then an active plan is spent only when its
 * branch is provably gone — `undefined` ("cannot tell") stays active, because a
 * guessed transition here would archive live work.
 */
export function computeLifecycle(inputs: ILifecycleInputs): TPlanLifecycle {
  if (inputs.inArchive) return 'archived';
  if (inputs.status === 'draft') return 'draft';
  // status === 'active'
  return inputs.branchExists === false ? 'spent' : 'active';
}

/** Whether a lifecycle transition is one the machine allows — used to reject an
 * out-of-order move (e.g. archiving something still active). */
const ORDER: readonly TPlanLifecycle[] = ['draft', 'active', 'spent', 'archived'];
export function isForwardTransition(from: TPlanLifecycle, to: TPlanLifecycle): boolean {
  return ORDER.indexOf(to) > ORDER.indexOf(from);
}
