/**
 * A ratchet — a counter that only turns one way. A check that cannot reach its
 * target today (a pre-existing pile of violations, a score below the bar) is armed
 * anyway by recording the current measurement and failing only on a move in the
 * wrong direction. The number is walked towards the target as the debt is paid and
 * can never move back, so a green check can never quietly get greener by moving its
 * own bar. The one-way invariant is enforced by the store, not by trust.
 */

/**
 * Which way a ratchet is allowed to travel.
 *
 * `down` is the debt counter this engine shipped with: a count of violations, and
 * lower is better. It was also, for a while, the only thing a ratchet could be —
 * which is why two real measurements ended up OUTSIDE the mechanism entirely,
 * reading and validating their own JSON by hand: a coverage score and a
 * mutation score both only rise, and a score whose ratchet "only turns down" is a bar
 * that erases itself the first time anything tightens it.
 *
 * So the direction is DECLARED, and the store, the tighten path and the at-rest
 * audit all read the same declaration. Nothing else about a ratchet changes: it is
 * still one number in one file, still armed at the measurement, still unable to
 * move the way that would hide a regression.
 */
export type TRatchetDirection = 'down' | 'up';

/**
 * A ratchet as a check declares it: `ratchet: 3`, or the object when it needs more than
 * a ceiling — its own store id, or a score that may only rise.
 *
 * ONE INPUT. It used to be three fields beside each other on every factory — the ceiling,
 * a store id and a direction, each a key of its own — and a check could set the direction without the id or
 * the id without a ceiling, each combination read by a different piece of the engine.
 */
export interface IRatchetDeclaration {
  /** The store's key for the threshold. Defaults to the check's id. */
  readonly id?: string;
  /** `down` (the default): a debt count that may only fall. `up`: a score that may only rise. */
  readonly direction?: TRatchetDirection;
  /** The worst value the check tolerates, declared inline: the count it was armed at, or
   * the lowest score it accepts. Used when no stored threshold overrides it. */
  readonly ceiling?: number;
}

/** What a check's `ratchet` may be written as — a bare ceiling, or the declaration. */
export type TRatchetInput = number | IRatchetDeclaration;

/** The declaration a `ratchet` input stands for, or `undefined` when there is none. */
export function ratchetDeclaration(input: TRatchetInput | undefined): IRatchetDeclaration | undefined {
  if (input === undefined) return undefined;
  return typeof input === 'number' ? { ceiling: input } : input;
}

export interface IRatchet {
  /** Stable identifier, unique per check (the debt is one file per check —
   * measured ~6 edits in 8 days, so a shared file would conflict constantly). */
  readonly id: string;
  /** The current allowed value. A `down` ratchet fails when the live count exceeds
   * this; an `up` ratchet fails when the live score falls below it. */
  readonly value: number;
}

/** Whether `next` is an improvement on `current` for a ratchet travelling `direction`
 * — the one definition of "tighter", so the store, the runner and the at-rest audit
 * cannot disagree about which way is forward. */
export function isTighter(current: number, next: number, direction: TRatchetDirection = 'down'): boolean {
  return direction === 'up' ? next > current : next < current;
}

/** The tightened value: `next` when it is an improvement, otherwise the stored one.
 * A ratchet never travels backwards, so this is where a worse measurement is
 * discarded rather than persisted. */
export function tightenedTo(current: number, next: number, direction: TRatchetDirection = 'down'): number {
  return isTighter(current, next, direction) ? next : current;
}

/** Whether a live measurement satisfies a stored ratchet. `down`: at or below.
 * `up`: at or above. Used by the primitives to decide a verdict and by the at-rest
 * audit to decide whether a stored file sits on the wrong side of its ceiling. */
export function satisfiesRatchet(measured: number, threshold: number, direction: TRatchetDirection = 'down'): boolean {
  return direction === 'up' ? measured >= threshold : measured <= threshold;
}
