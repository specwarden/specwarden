import type { ICheck, ICheckRule } from '../check/check.model';
import type { TRatchetInput } from '../ratchet/ratchet.model';
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
  /**
   * Ratchet the check's measurement: `ratchet: 3` tolerates three and fails on a fourth;
   * `ratchet: { id, direction, ceiling }` when the store key is not the check's id or the
   * measurement is a score that may only rise (`direction: 'up'`). The stored threshold is
   * read into `ctx.threshold`, and `--tighten` walks it towards the target.
   *
   * It lives on the identity rather than on each factory's own options because the
   * ceiling is also what the at-rest audit compares a stored file against. Declared here,
   * the engine can read every ceiling off the roster; declared only inside a factory, a
   * repository has to keep a second copy of each one in its config, by hand, and that
   * copy is what drifts.
   */
  readonly ratchet?: TRatchetInput;
  /** The rule this check enforces, declared beside it. It joins the register
   * enforced by this check, so the register stops being a second list of the same
   * fact. See `rule` on ICheckMeta.
   *
   * A string is the statement, and the common case: `rule: 'no TODO in shipped source'`.
   * The owner then defaults to the file that declares the check, which is where a
   * reader who meets the finding goes first. */
  readonly rule?: string | ICheckRule;
}

/**
 * What a check FILE writes: the identity with every field the engine can supply left
 * out.
 *
 * A one-line check used to carry seven fields, three of which said something. The id
 * is the file's name when the file exports the check alone; the title is the rule's
 * statement, else the id; the tier is `fast` — a check with no stated tier should
 * run often rather than never. What is left is what only the author knows.
 *
 * `ICheckIdentity` stays the full form: a module declaring a factory of its own may
 * still demand every field, and a check built outside discovery with no id is refused
 * when it is registered, by name.
 */
export interface ICheckDeclaration extends Omit<ICheckIdentity, 'id' | 'title' | 'tier'> {
  /** The runner's address for the check. Absent: the name of the file that exports it
   * alone — and refused at registration anywhere else. */
  readonly id?: string;
  /** Absent: the rule's statement, else the id. */
  readonly title?: string;
  /** Absent: `fast`. */
  readonly tier?: TTier;
}

/**
 * What a MODULE's factory takes: the declaration, without `zone`.
 *
 * A module's check speaks for the module — its rule is the module's, owned by its package —
 * so the zone is the factory's to set, never the consumer's. Every module factory takes
 * this, so the identity a consumer may write is the same across all of them.
 */
export type IModuleCheckDeclaration = Omit<ICheckDeclaration, 'zone'>;
