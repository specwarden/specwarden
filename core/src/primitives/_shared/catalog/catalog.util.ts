/**
 * Built-in knowledge a caller can extend, replace, or switch off — by name.
 *
 * THE PROBLEM THIS SOLVES. A check ships with a table: credential shapes, hedge
 * words, a declaration grammar. Shipping it is right — a repository that had to
 * supply the AWS key format before it could scan for secrets would simply not scan
 * for secrets. Freezing it is not: the table is the check's opinion, and an opinion
 * that cannot be argued with is a fork waiting to happen. Some of these tables are
 * genuinely universal (an npm scoped-package name looks the same everywhere); others
 * only look universal until someone writes documentation in another language, or
 * declares functions in a language whose grammar the regex does not describe.
 *
 * So every built-in table is a CATALOG: a list of identified entries, exported from
 * the package, and reachable through three verbs.
 *
 *   extra    add entries beside the built-ins — the common case, and the cheap one
 *   disable  switch a built-in off BY ID, with a reason
 *   replace  ignore the built-ins entirely and supply the whole list
 *
 * WHY `disable` DEMANDS A REASON. Turning a rule off is the one edit that makes a
 * check quieter, and a quieter check is indistinguishable from a passing one. The
 * reason is not decoration: it is carried into the verdict as an info finding, so a
 * run says out loud what it is no longer looking for. This is the same bargain the
 * rule registry already strikes — an unenforced rule is allowed, an unenforced rule
 * with no stated reason is not.
 *
 * `replace` states the same thing more loudly by saying nothing at all, so it is
 * reported too: a caller who replaces the credential catalog with an empty list has
 * turned the check off, and the run should not look identical to one that found
 * nothing.
 */

/** Anything a catalog holds: identified, so it can be named in `disable`. */
export interface ICatalogEntry {
  readonly id: string;
}

/** One built-in switched off, and why. The reason is required — see the header. */
export interface ICatalogDisable {
  readonly id: string;
  /** Why this entry does not apply here. Reported, never silent. */
  readonly why: string;
}

/**
 * How a caller adjusts one built-in catalog. Every field is optional; supplying none
 * yields the built-ins unchanged, which is what most repositories want on day one.
 */
export interface ICatalogOptions<T extends ICatalogEntry> {
  /** Entries added beside the built-ins. An id already present REPLACES that
   * built-in — an override, which is reported as one. */
  readonly extra?: readonly T[];
  /** Built-ins switched off by id, each with a reason. */
  readonly disable?: readonly ICatalogDisable[];
  /** The whole list, in place of the built-ins. */
  readonly replace?: readonly T[];
}

export interface IResolvedCatalog<T extends ICatalogEntry> {
  readonly entries: readonly T[];
  /** Human-readable lines describing every deviation from the built-ins, for the
   * check to report. Empty when the caller changed nothing. */
  readonly notes: readonly string[];
}

/**
 * Apply a caller's adjustments to a built-in catalog.
 *
 * `label` names the catalog in the notes ("credential pattern"), so a reader of a
 * verdict knows WHICH table was adjusted without opening the config.
 *
 * An id in `disable` that matches no built-in is itself reported: it is almost always
 * a rename or a typo, and left silent it reads as a rule being suppressed when in
 * fact the rule is still firing.
 */
export function resolveCatalog<T extends ICatalogEntry>(
  builtin: readonly T[],
  options: ICatalogOptions<T> | undefined,
  label: string,
): IResolvedCatalog<T> {
  const notes: string[] = [];
  const opts = options ?? {};

  if (opts.replace) {
    notes.push(
      `${label}s: the built-in catalog (${builtin.length}) was REPLACED by ${opts.replace.length} supplied entr${opts.replace.length === 1 ? 'y' : 'ies'}.`,
    );
    return { entries: opts.replace, notes };
  }

  const disabled = new Map((opts.disable ?? []).map((d) => [d.id, d.why]));
  const known = new Set(builtin.map((e) => e.id));
  for (const [id, why] of disabled) {
    if (!known.has(id)) {
      notes.push(
        `${label} '${id}' is disabled but no built-in has that id — a rename or a typo, so nothing was switched off.`,
      );
      continue;
    }
    notes.push(`${label} '${id}' disabled: ${why}`);
  }

  const overridden = new Set((opts.extra ?? []).map((e) => e.id).filter((id) => known.has(id)));
  for (const id of overridden) notes.push(`${label} '${id}' overridden by a supplied entry of the same id.`);

  const kept = builtin.filter((e) => !disabled.has(e.id) && !overridden.has(e.id));
  return { entries: [...kept, ...(opts.extra ?? [])], notes };
}

/** The catalog's notes as engine findings, so a run says what it stopped looking for. */
export function catalogNotes(notes: readonly string[]): readonly { severity: 'info'; message: string }[] {
  return notes.map((message) => ({ severity: 'info' as const, message }));
}
