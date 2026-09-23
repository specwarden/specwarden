/**
 * Which check factories a package publishes, and which of them nothing exercises.
 *
 * WHY THIS IS IN THE PRODUCT. A playground lists the factories it covers, and that list
 * is a CLAIM — it goes stale the first time somebody adds a factory, and nothing notices,
 * because the new factory simply is not mentioned anywhere. That is this product's own
 * central failure shape one layer up: the suite reports success about a surface it never
 * read. Every package that ships checks has the same claim to defend, so the means of
 * defending it belongs here rather than being retyped, slightly differently, seven times.
 *
 * HOW A FACTORY IS TOLD FROM A HELPER, and why not by name. A module's barrel also
 * exports parsers and predicates — `parseCompose`, `hostOf`, `violationsFor`. A naming
 * convention would work until the day somebody names one badly, and then the audit that
 * exists to catch an omission would itself omit silently. So the test is what the export
 * DOES: called with an identity-shaped object, a factory returns a check — a value
 * carrying an `id` and a `run`. Nothing else in a barrel does.
 *
 * A helper handed that object throws, or returns something else. Both are the answer
 * "not a factory", and both are taken as such.
 */

/** What a factory is probed with: one object carrying every option any of them needs. */
export type TFactoryProbe = Readonly<Record<string, unknown>>;

export interface IPublishedFactoriesOptions {
  /** The factory names the caller claims to exercise. */
  readonly covered: readonly string[];
  /**
   * The argument every export is called with. It carries the union of the options the
   * package's factories take, because a factory that refuses its options reads here as a
   * helper — and an uncovered factory that reads as a helper is the omission this
   * function exists to prevent.
   */
  readonly probe: TFactoryProbe;
}

/** Every export of `module` that produces a check, whether or not it is covered. */
export function publishedFactories(module: Readonly<Record<string, unknown>>, probe: TFactoryProbe): string[] {
  const found: string[] = [];

  for (const [name, value] of Object.entries(module)) {
    // A factory is a function, and lower-cased by this product's own convention — an
    // upper-cased export is a class or a constant, and calling one has side effects a
    // test has no business triggering.
    if (typeof value !== 'function' || !/^[a-z]/.test(name)) continue;

    let produced: unknown;
    try {
      produced = (value as (options: TFactoryProbe) => unknown)(probe);
    } catch {
      continue;
    }

    const check = produced as { id?: unknown; run?: unknown } | null;
    if (typeof check?.id === 'string' && typeof check?.run === 'function') found.push(name);
  }

  return found.sort();
}

/**
 * The factories a package publishes that the caller's list does not name.
 *
 * Assert it is empty. A non-empty result is not a style complaint: it is a check that
 * ships to consumers with nothing having run it end to end.
 */
export function uncoveredFactories(
  module: Readonly<Record<string, unknown>>,
  options: IPublishedFactoriesOptions,
): string[] {
  const covered = new Set(options.covered);
  return publishedFactories(module, options.probe).filter((name) => !covered.has(name));
}
