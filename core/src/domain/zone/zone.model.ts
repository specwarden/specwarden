/**
 * Zones — the pure base of the barrier the whole product rests on.
 *
 * Two zones exist. The PRODUCT zone (`'product'`, "P") is this package: an engine
 * that survives renaming the project, swapping the domain and swapping the stack.
 * The CONSUMER zone (`'consumer'`, "C") is a consumer repository's `.specwarden/`: it
 * knows both the product and the repository, and it is where anything mentioning a
 * concrete workspace, framework or table lives. The dependency is one-way — C
 * reaches into P, P never into C.
 *
 * This module is universal on purpose: it holds the two zone values — but NOT the
 * mapping FROM a location TO a zone. That mapping ("P code lives here") is a fact
 * about one repository's layout, so it fails the "rename the project" test and
 * lives on the consumer/test side, never here.
 */

/** The two zones. A string union rather than an enum, following this codebase's
 * preference for `as const` unions over `enum`. */
export type TZone = 'product' | 'consumer';

export const ZONES = ['product', 'consumer'] as const;
