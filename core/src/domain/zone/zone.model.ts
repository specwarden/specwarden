/**
 * Zones — the pure floor of the barrier the whole product rests on.
 *
 * Two zones exist. The PRODUCT zone (`'product'`, "P") is this package: an engine
 * that survives renaming the project, swapping the domain and swapping the stack.
 * The CONSUMER zone (`'consumer'`, "C") is a host repository's `.specwarden/`: it
 * knows both the product and the repository, and it is where anything mentioning a
 * concrete workspace, framework or table lives. The dependency is one-way — C
 * reaches into P, P never into C.
 *
 * This module is universal on purpose: it holds the two zone values and the rule
 * that a declared zone must match the zone a file's location implies — but NOT the
 * mapping FROM a location TO a zone. That mapping ("P code lives here") is a fact
 * about one repository's layout, so it fails the "rename the project" test and
 * lives on the consumer/test side, never here.
 */

/** The two zones. A string union rather than an enum, following the house
 * preference for `as const` unions over `enum`. */
export type TZone = 'product' | 'consumer';

export const ZONES = ['product', 'consumer'] as const;

/** Thrown when a check declares a zone its location contradicts — a product-zone
 * file tagged `consumer`, or the reverse. A distinct type so a caller can tell a
 * zone violation from any other failure. */
export class SpecwardenZoneError extends Error {
  override readonly name = 'SpecwardenZoneError';
  constructor(
    readonly declared: TZone,
    readonly implied: TZone,
    readonly location?: string,
  ) {
    super(
      `zone mismatch${location ? ` at ${location}` : ''}: the file declares ` +
        `declares zone '' but its location implies ''. ` +
        `A check written inside the engine is 'product'; one written in a host ` +
        `repository's .specwarden/ is 'consumer'. The two never cross.`,
    );
  }
}

/**
 * Assert that a declared zone matches the zone a file's location implies. The
 * caller supplies the implied zone — this function does not know how a path maps
 * to a zone, because that knowledge is repository-specific (see the module note).
 * A no-op when the location implies nothing (a file under neither tree).
 */
export function assertZoneMatchesLocation(declared: TZone, implied: TZone | undefined, location?: string): void {
  if (implied !== undefined && implied !== declared) {
    throw new SpecwardenZoneError(declared, implied, location);
  }
}
