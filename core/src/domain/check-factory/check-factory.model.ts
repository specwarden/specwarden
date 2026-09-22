import type { ICheck, ICheckRule } from '../check/check.model';
import type { TRatchetDirection } from '../ratchet/ratchet.model';
import type { TWhen } from '../relevance/relevance.model';
import type { TTier } from '../vocabulary/vocabulary.constant';
import type { TZone } from '../zone/zone.model';

/**
 * The middle intervention level: COMPOSE. Between taking a built-in as-is
 * (configure) and writing a class from scratch (write) sits the case ESLint proved
 * is the common one — a user who never writes a rule but adjusts a built-in's
 * inputs and policy. A check factory is exactly that: a function from options to a
 * check.
 *
 *   checks: [
 *     docPaths({ id: 'doc-paths', tier: 'fast', roots: ['docs'], ignore: ['dist'] }),
 *   ]
 *
 * Making the built-ins factories is why this lands BEFORE the checks migrate: a
 * fixed class rewritten into a factory afterwards is a change across all of them at
 * once.
 */
export type TCheckFactory<O> = (options: O) => ICheck;

/**
 * The identity every factory takes, on top of its own options. A produced check is
 * consumer-zone by default — the options carry repository-specific paths, which is
 * consumer knowledge — and a plugin may override it.
 */
export interface ICheckIdentity {
  readonly id: string;
  readonly title: string;
  readonly tier: TTier;
  readonly zone?: TZone;
  readonly advisory?: boolean;
  /**
   * When this check matters — a predicate over the changed set, or the declarative
   * form. Absent means always relevant.
   *
   * IT LIVES ON THE IDENTITY because every factory needs it and none of them was
   * carrying it: each called `buildCheck` without a predicate, so a `when` handed to
   * `forbidImport`, `regenerable` or any of the other six was accepted by the type and
   * then silently dropped. Those checks ran on every change — a filter nobody wrote,
   * doing nothing, invisible to the consumer that thought it had one. Read here, one
   * line covers all eight factories at once.
   */
  readonly when?: TWhen;
  readonly hint?: string;
  /** Give up on the check after this many seconds and fail it — see timeoutSec on ICheckMeta
   * for what a deadline can and cannot interrupt. */
  readonly timeoutSec?: number;
  /** Run this check alone under `--jobs` — see `exclusive` on ICheck for what
   * assuming isolation instead costs. */
  readonly exclusive?: boolean;
  /** Ratchet the check's measurement to a file: the stored threshold is read into
   * `ctx.ratchet`, and `--tighten` walks it towards the target. Defaults to the
   * check id. */
  readonly ratchetId?: string;
  /** Which way that ratchet travels — `down` for a debt count (the default), `up`
   * for a floor a score must stay above. */
  readonly ratchetDirection?: TRatchetDirection;
  /**
   * The tolerance the check declares INLINE — the count it was armed at, used when
   * no stored ratchet overrides it.
   *
   * It lives on the identity rather than on each factory's own options because it is
   * also what the at-rest audit compares a stored file against. Declared here, the
   * engine can read every ceiling off the roster; declared only inside a factory, a
   * repository has to keep a second copy of each one in its config, by hand, and that
   * copy is what drifts.
   */
  readonly ratchet?: number;
  /** The rule this check enforces, declared beside it. It joins the register
   * enforced by this check, so the register stops being a second list of the same
   * fact. See `rule` on ICheckMeta. */
  readonly rule?: ICheckRule;
}
