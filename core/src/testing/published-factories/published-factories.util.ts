import { CheckOptionsError } from '../../primitives/_shared/check-options/check-options.util';

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
 * "not a factory", and both are taken as such — with one exception, below.
 *
 * A FACTORY THAT REFUSES THE PROBE IS STILL A FACTORY. Factories check their options by
 * name now, so a probe carrying the union of a package's options is refused by every one
 * of them with a `CheckOptionsError`. Read as "threw, so a helper", that made every
 * factory a helper, the audit found nothing, and it reported nothing uncovered — a green
 * run over a package it never read. A refusal that speaks the option checker's language is
 * the most certain sign there is that the export builds checks. So is returning an array
 * of checks, or a plugin carrying `checks`.
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
    } catch (error) {
      if (error instanceof CheckOptionsError) found.push(name);
      continue;
    }

    if (producesChecks(produced)) found.push(name);
  }

  return found.sort();
}

const isCheck = (value: unknown): boolean => {
  const check = value as { id?: unknown; run?: unknown } | null;
  return typeof check?.id === 'string' && typeof check?.run === 'function';
};

/** A check, a non-empty array of checks, or a plugin whose `checks` are checks. */
function producesChecks(produced: unknown): boolean {
  if (isCheck(produced)) return true;
  if (Array.isArray(produced)) return produced.length > 0 && produced.every(isCheck);
  const checks = (produced as { checks?: unknown } | null)?.checks;
  return Array.isArray(checks) && checks.length > 0 && checks.every(isCheck);
}

/** Thrown when an audit recognised none of the factories the caller says it covers. */
export class FactoryAuditError extends Error {
  override readonly name = 'FactoryAuditError';
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
  const published = publishedFactories(module, options.probe);
  // The audit's own silent green: a claim naming factories, none of which the probe could
  // recognise, means the probe stopped working — not that the package became complete.
  if (options.covered.length > 0 && !published.some((name) => covered.has(name))) {
    throw new FactoryAuditError(
      `none of the ${options.covered.length} factories this claim covers (${options.covered.join(', ')}) was recognised as a factory. ` +
        'The probe no longer reaches them, so the audit would have examined nothing and passed.',
    );
  }
  return published.filter((name) => !covered.has(name));
}
