import type { ISpecRequirement } from '../spec-source/spec-source.model';

/**
 * The seam interop exists for: a requirement decided upstream (OpenSpec, Spec Kit,
 * Kiro) is DEPOSITED into a module document as an invariant — the statement carried
 * over, the identifier preserved so the invariant traces back to the requirement it
 * proves. This module computes the deposit, in BOTH directions, and nothing more:
 *
 *   - a requirement with no invariant yet → a proposed deposit (a human decides it
 *     becomes a module invariant; automation here would put a statement written for
 *     APPROVAL into a document read as truth about BEHAVIOUR);
 *   - an invariant whose upstream requirement has vanished → an orphan, shown, not
 *     silently kept — an invariant with no requirement is coverage that proves a
 *     thing nobody asked for any more.
 *
 * Keyed on the stable id both sides share. This is pure: it decides WHAT to sync;
 * the CLI prepares the edit and shows it, and writes nothing.
 */
export interface IExistingInvariant {
  /** The id it carries (the requirement id it was deposited from). */
  readonly id: string;
  /** Where it lives, for the orphan report. */
  readonly location: string;
}

export interface IInvariantDeposit {
  readonly id: string;
  readonly statement: string;
}

export interface IInvariantSyncPlan {
  /** Requirements not yet present as an invariant — proposed deposits. */
  readonly toDeposit: readonly IInvariantDeposit[];
  /** Invariants whose backing requirement is gone — orphans to reconcile. */
  readonly orphaned: readonly IExistingInvariant[];
  /** Ids present on both sides — already in sync, reported for completeness. */
  readonly inSync: readonly string[];
}

export function planInvariantSync(
  requirements: readonly ISpecRequirement[],
  existing: readonly IExistingInvariant[],
): IInvariantSyncPlan {
  const existingIds = new Set(existing.map((e) => e.id));
  const requirementIds = new Set(requirements.map((r) => r.id));

  const toDeposit = requirements
    .filter((r) => !existingIds.has(r.id))
    .map((r) => ({ id: r.id, statement: r.statement }));
  const orphaned = existing.filter((e) => !requirementIds.has(e.id));
  const inSync = requirements.filter((r) => existingIds.has(r.id)).map((r) => r.id);

  return { toDeposit, orphaned, inSync };
}

/** Extract the invariant ids a document declares, by a caller-supplied id pattern
 * (its first capture group is the id). WHICH shape a module doc marks invariants in
 * is a fact about the consumer's documentation convention, so the pattern is supplied,
 * never assumed. */
export function invariantsInDocument(location: string, text: string, idPattern: RegExp): readonly IExistingInvariant[] {
  const re = new RegExp(idPattern.source, idPattern.flags.includes('g') ? idPattern.flags : `${idPattern.flags}g`);
  const out: IExistingInvariant[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(re)) {
    const id = m[1];
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push({ id, location });
    }
  }
  return out;
}
