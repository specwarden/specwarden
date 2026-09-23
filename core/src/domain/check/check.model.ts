import type { IVerdict } from '../finding/finding.model';
import type { TCapability, TTier } from '../vocabulary/vocabulary.constant';
import type { IClock } from '../ports/clock/clock.port';
import type { IFileSource } from '../ports/file-source/file-source.port';
import type { IFileWriter } from '../ports/file-writer/file-writer.port';
import type { IProcessRunner } from '../ports/process-runner/process-runner.port';
import type { TRatchetDirection } from '../ratchet/ratchet.model';
import type { IVcs } from '../ports/vcs/vcs.port';
import type { TZone } from '../zone/zone.model';

/**
 * The handles a check runs against. It is CAPABILITY-GATED: the engine builds a
 * context in which the ports a check did not declare are present in type but throw
 * on use, so an undeclared `exec` is a runtime refusal, not a silent escalation.
 * The reporter is deliberately absent — a check returns a verdict, it never prints.
 */
export interface ICheckContext {
  /** The changed-file set this run is filtering against (repository-relative). */
  readonly changed: readonly string[];
  /** The `i/N` shard this run requested, forwarded verbatim to a check that shards
   * its work (a test suite); `undefined` for an unsharded run. Most checks ignore it. */
  readonly shard?: string;
  /** The stored ratchet threshold for this check (from its ratchet file), or
   * `undefined` when it has no ratchet. A `down` ratchet holds while the measured
   * count does not EXCEED this; an `up` ratchet holds while the measured score does
   * not FALL BELOW it. */
  readonly ratchet?: number;
  /**
   * The run's manifest — every registered check's identity, this one included.
   *
   * For the checks that audit the roster itself: a CI-coverage check reconciling jobs
   * against gates, a plan check validating the ids an acceptance names. They used to
   * be handed the list by the consumer, which meant the consumer BUILT the list —
   * seventy lines of imports and a map — and any check the consumer forgot to add was
   * invisible to the very audit meant to catch it. Read through the engine, the list
   * is the roster the engine is actually running.
   *
   * A thunk, because the roster is complete only after every check is built.
   */
  readonly roster: () => readonly ICheckMeta[];
  readonly files: IFileSource;
  readonly vcs: IVcs;
  readonly proc: IProcessRunner;
  readonly clock: IClock;
  /** Gated on the `write` capability — a non-`write` check gets a writer that
   * throws. A check writes only through this, and in practice only from `fix`. */
  readonly writer: IFileWriter;
}

/**
 * The declared identity of a check — everything the engine needs to decide
 * whether, and with what powers, to run it, WITHOUT executing it. Carried by the
 * check's own declaration; read at registration.
 */
export interface ICheckMeta {
  readonly id: string;
  readonly title: string;
  readonly tier: TTier;
  readonly zone: TZone;
  /** What the check may touch. The engine denies everything not listed here. */
  readonly capabilities: readonly TCapability[];
  /**
   * The major check-contract version this was built against. The engine refuses
   * to load a check whose value differs from `CHECK_CONTRACT_VERSION`, with a
   * legible message rather than a failure deep inside `run`.
   */
  readonly contractVersion: number;
  /** Advisory checks report but never fail the run — reserved for the SHAPE of a
   * document, never the correctness of code or a schema. */
  readonly advisory?: boolean;
  /**
   * This check must run ALONE — nothing else in flight.
   *
   * Concurrency makes a promise on a check's behalf: that it is isolated. Most are —
   * they read the tree and compute. Some are not, and the ways they are not do not
   * announce themselves: a suite that spawns a process per file and saturates the
   * machine, a command that writes to a shared temporary path, a port that only one
   * listener can hold.
   *
   * Measured here before this existed: at `--jobs 6` a suite of that first kind
   * failed on two runs out of three and passed on the third, with no message naming
   * a cause. A check that fails only sometimes, for a reason outside its subject, is
   * worse than a slow one — it teaches a team to re-run rather than to read.
   *
   * So isolation is DECLARED rather than assumed, and the declaration costs only that
   * check's own overlap.
   */
  readonly exclusive?: boolean;
  /** One line telling a human how to fix a failure. */
  readonly hint?: string;
  /**
   * Give up on this check after this many seconds and fail it, rather than letting the
   * run hang.
   *
   * WHAT IT COVERS AND WHAT IT CANNOT. It races the check's promise, so it ends a check
   * waiting on anything — a subprocess, a network call, a timer — and reports which
   * check stalled and for how long. It CANNOT interrupt a synchronous busy loop: a
   * single-threaded runtime has no way to preempt one, and pretending otherwise would
   * be the worse failure, a declared guard that does not guard. A check that spends its
   * time in a subprocess should also hand that subprocess its own timeout, because
   * killing the child is what actually frees the machine.
   *
   * Absent means no deadline, which is the right default for the overwhelming majority:
   * a wrong deadline turns a slow machine into a red run, and that teaches re-running.
   */
  readonly timeoutSec?: number;
  /**
   * When set, the check's measurement is ratcheted: its threshold lives in a file
   * (`<consumerDir>/ratchets/<id>.json`), is read into `ICheckContext.ratchet`, and
   * `specwarden check --tighten` walks it towards the target.
   *
   * `direction` says which way "towards the target" runs. It defaults to `down`,
   * the debt counter — but a floor that only rises is the same mechanism, and while
   * it could not be declared, a floor — a coverage number, a mutation score — had to be
   * kept OUTSIDE the ratchet system entirely, reading and validating its own JSON by
   * hand, where the at-rest audit that catches a hand-edited threshold never reaches it.
   *
   * `ceiling` is the value the check declares INLINE as the worst it tolerates.
   * The at-rest audit reads it from the roster, which is what lets a repository stop
   * keeping a second copy of every ceiling in its config — two lists describing one
   * thing, and the one that drifts is always the copy.
   */
  readonly ratchet?: {
    readonly id: string;
    readonly direction?: TRatchetDirection;
    readonly ceiling?: number;
  };
  /**
   * The rule this check enforces, declared WITH the check rather than in a register
   * far away from it.
   *
   * The rule register and the check roster are two descriptions of one fact, joined
   * only by a string id. That is the shape this engine already refused once for the
   * gate list: a hand-maintained list beside a tree that the engine can read, kept in
   * step by whoever remembers. Most rules in a register name exactly one check, and
   * many name a check whose id is their own.
   *
   * A rule declared here joins the register with `enforcement: { checkIds: [<this
   * check>] }` and an id defaulting to the check's own. Rules that belong to no check
   * — the ones declared not mechanizable, and the enforcers that are not checks —
   * stay in the register, which is the only place they can live.
   */
  readonly rule?: ICheckRule;
}

/**
 * A rule as a check declares it. The id is optional because it defaults to the
 * check's, and `enforcement` is absent by construction: a rule stated here is
 * enforced by the check stating it, and letting it claim otherwise would reintroduce
 * exactly the drift this closes.
 */
export interface ICheckRule {
  readonly id?: string;
  /** The assertion itself, in one line. */
  readonly statement: string;
  /** The document that owns the rule — where its rationale is written. Absent on a
   * discovered check: the file that declares it, repository-relative. */
  readonly owner?: string;
  readonly zone?: TZone;
  /** Marks a rule whose violation cannot be undone. */
  readonly irreversible?: boolean;
  /**
   * Supplied by the FACTORY, not written by the consumer: a module knows what its check
   * enforces, so its check names that rule and is no orphan the day it is wired. An
   * implied rule yields to the register — it is dropped where a register rule already
   * names this check, and never refused as a duplicate of one.
   */
  readonly implied?: boolean;
}

/**
 * A check: its declared identity, a run predicate over the changed set, and the
 * execution itself. `run` returns a verdict and never prints. It may be async so
 * an adapter can await a subprocess, but the runner keeps invocations sequential
 * (a reproducible manifest depends on a stable order).
 */
export interface ICheck extends ICheckMeta {
  /** True when this change could affect the check. When the changed set is not
   * knowable the runner does not consult this — it runs everything. */
  when(changed: readonly string[]): boolean;
  run(ctx: ICheckContext): IVerdict | Promise<IVerdict>;
}

/**
 * The optional autofix interface. A check that can repair its own findings
 * implements `fix`; the engine calls it under `specwarden check --fix`, then
 * re-runs the check to report what remains. Fixing requires the `write`
 * capability — a fixable check that did not declare `write` gets a writer that
 * throws, which is the correct refusal. ESLint's adoption rides on this being
 * present, which is why it enters before the checks migrate rather than after.
 */
export interface IFixOutcome {
  /** How many findings the fix repaired. */
  readonly fixed: number;
  /** Optional one-line human summary of what was changed. */
  readonly summary?: string;
}

export interface IFixable {
  fix(ctx: ICheckContext): IFixOutcome | Promise<IFixOutcome>;
}

/** Whether a check offers autofix. */
export function isFixable(check: ICheck): check is ICheck & IFixable {
  return typeof (check as Partial<IFixable>).fix === 'function';
}

/** One line of the run's record: what a check decided and how long it took. The
 * reporter renders these; nothing else formats a result. */
export interface ICheckResult {
  readonly meta: ICheckMeta;
  readonly verdict: IVerdict;
  readonly durationMs: number;
  /** Set when the check was selected but skipped (by request, or not relevant) — or ran
   * and could not look (`cannot-tell`: its verdict says why, in `verdict.skipped`). */
  readonly skipped?: 'not-relevant' | 'by-request' | 'cannot-tell';
}
