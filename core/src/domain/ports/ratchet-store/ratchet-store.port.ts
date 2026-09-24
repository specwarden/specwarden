import type { IRatchet, TRatchetDirection } from '../../ratchet/ratchet.model';

/**
 * Persistence for ratchets. The one-way invariant lives in the implementation and
 * is pinned by its test: `tighten` may only ever move a stored value TOWARDS its
 * target, and no public operation moves one away. `establish` sets a baseline that
 * does not yet exist; calling it on an existing id is how a debt would be inflated,
 * so an implementation treats an initial baseline and a later loosening differently
 * — see the store's own contract.
 *
 * Which way "towards" runs is the caller's declaration, not the store's assumption.
 * It arrives as the optional third argument, defaulting to the debt counter this
 * engine started with — so an adapter written against the two-argument signature
 * still satisfies this interface and still behaves exactly as before.
 */
export interface IRatchetStore {
  /** The stored ratchet, or `undefined` if this id has no baseline yet. */
  read(id: string): IRatchet | undefined;

  /** Establish the baseline for an id that has none. Refuses to overwrite an
   * existing one — a baseline is set once; thereafter it only tightens. */
  establish(id: string, value: number): IRatchet;

  /** Move the stored value to `value` when that is TIGHTER for this ratchet's
   * direction (lower for a debt, higher for a rising ratchet, `direction: 'up'`). A no-op otherwise —
   * tightening never loosens a ratchet, which is the whole point. */
  tighten(id: string, value: number, direction?: TRatchetDirection): IRatchet;
}
