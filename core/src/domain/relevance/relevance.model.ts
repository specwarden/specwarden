/**
 * The relevance predicate, declared instead of written.
 *
 * A `when` is the quietest thing in a check. It decides whether the check runs at
 * all, it is never itself checked, and when it is wrong the symptom is a green run
 * — which is the failure mode this whole engine exists against. Most predicates are one
 * of two shapes ("a path under this prefix" / "a file matching this pattern"), and
 * hand-written each time they need helpers the consumer has to author and maintain,
 * in a file that also has to re-derive the repository root — the part that goes wrong
 * in every body at once.
 *
 * So the two shapes are declarable, the helpers ship with the engine, and a
 * predicate remains available for everything else — an escape hatch, not the default
 * way in.
 */

/**
 * What a check states about when it matters. Either a predicate over the changed
 * set, or the declarative form. `{}` and an omitted `when` both mean "always
 * relevant", which is the correct default for a check too cheap to filter and for
 * one whose blast radius nobody has worked out yet.
 */
export type TWhen = ((changed: readonly string[]) => boolean) | IWhenSpec;

export interface IWhenSpec {
  /** Relevant when a changed path starts with any of these prefixes. Directory
   * prefixes carry their trailing slash: `src/` never matches `srcgen/`. */
  readonly under?: readonly string[];
  /** Relevant when a changed path ends with any of these suffixes — the cheap form
   * of "any file of this kind", written as `.md` or `.check.mjs`. */
  readonly ending?: readonly string[];
  /** Relevant when a changed path CONTAINS any of these fragments. The loosest of
   * the three: it matches mid-path, so `/schema/` finds the folder wherever it sits.
   * Prefer `under` when the location is known — a fragment matches more than its
   * author usually means. */
  readonly containing?: readonly string[];
  /** Relevant regardless of what changed. Stated rather than achieved by leaving
   * every other field empty, so a spec that accidentally lost its only prefix is not
   * silently promoted to "always". */
  readonly always?: true;
}

/** True when any changed path starts with any of the prefixes. */
export function changedUnder(changed: readonly string[], ...prefixes: readonly string[]): boolean {
  return changed.some((file) => prefixes.some((prefix) => file.startsWith(prefix)));
}

/** True when any changed path ends with any of the suffixes. */
export function changedEnding(changed: readonly string[], ...suffixes: readonly string[]): boolean {
  return changed.some((file) => suffixes.some((suffix) => file.endsWith(suffix)));
}

/** True when any changed path contains any of the fragments, anywhere. */
export function changedContaining(changed: readonly string[], ...fragments: readonly string[]): boolean {
  return changed.some((file) => fragments.some((fragment) => file.includes(fragment)));
}

/**
 * Turn a declaration into the predicate the engine runs.
 *
 * An EMPTY spec is always-relevant, and so is an absent one: the conservative answer
 * is to run, because a check that skipped when it should have run reports success it
 * did not earn, while a check that ran when it need not have costs only time.
 */
export function resolveWhen(when: TWhen | undefined): (changed: readonly string[]) => boolean {
  if (when === undefined) return () => true;
  if (typeof when === 'function') return when;
  const { under = [], ending = [], containing = [], always } = when;
  if (always === true || (under.length === 0 && ending.length === 0 && containing.length === 0)) return () => true;
  return (changed) =>
    changedUnder(changed, ...under) || changedEnding(changed, ...ending) || changedContaining(changed, ...containing);
}
