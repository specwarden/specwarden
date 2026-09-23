import {
  type ICheck,
  type ICheckContext,
  type ICheckDeclaration,
  type IFinding,
  type IFixOutcome,
  type IVerdict,
  type TCapability,
  type TSeverity,
  type TTier,
  SEVERITIES,
  satisfiesRatchet,
} from '../../domain';
import { type TWhen, buildCheck, checkOptions, frameTolerated, resolveWhen } from '../_shared';

/**
 * The way to write a check that is not one of the declarative primitives.
 *
 * WHAT IT REPLACES, measured rather than guessed. In a corpus of real checks, sixteen
 * check files gave up on the two adapters the engine shipped and wrote a bare object
 * literal instead — not for anything exotic, but because those adapters could not
 * express a ratchet, an isolation flag, a line number or a second severity. Each of
 * the sixteen then re-wrote, by hand, the same four things:
 *
 *   - three lines of identity ceremony (`zone`, `capabilities`, `contractVersion`),
 *     one of which was written as a LITERAL `1` and would have kept loading silently
 *     after a contract bump — the exact failure the version field exists to prevent;
 *   - `ruleId: '<its own id>'` on every finding, 34 times across the corpus;
 *   - the same closing branch: findings means fail, no findings means a hand-written
 *     `✓ …` info line, because a verdict with no findings prints as a blank pass that
 *     reads as "did not run";
 *   - and, in the ratcheted ones, a comparison against `ctx.ratchet` plus a private
 *     channel to the ratchet store that the engine never read.
 *
 * So this owns all four. A body returns FINDINGS — the thing only it can know — and
 * everything around them is assembled here, identically for every check.
 *
 * THE FIFTH THING IT OWNS is the one nothing else could: `corpus`. A check that
 * examined nothing cannot fail, and a check that cannot fail reports success. That
 * is the defect family this engine is built against, and until now every check
 * guarded against it by hand, if it remembered to.
 */

/** What a check body returns. The short form is the common one: a list of findings,
 * empty meaning clean. */
export type TCheckOutcome = readonly IFinding[] | ICheckOutcome;

export interface ICheckOutcome {
  /** The defects found. Empty (or absent) is a clean run. */
  readonly findings?: readonly IFinding[];
  /**
   * How many units this run actually looked at — documents, modules, rows.
   *
   * It is what `corpus` is checked against, and it is also what turns a passing run
   * from "ok" into evidence: `✓ 0 problems in 438 documents` and `✓ 0 problems` are
   * the same verdict and very different claims.
   */
  readonly examined?: number;
  /** What was examined, named — `documents`, `modules`. Used in the pass note and in
   * the refusal when the corpus is empty. Defaults to `items`. */
  readonly unit?: string;
  /** Context worth printing that is not a defect. Each becomes an `info` finding, so
   * a passing run can still say what it looked at and what it skipped. */
  readonly notes?: readonly string[];
  /**
   * The measurement the ratchet is armed against, when it is NOT simply the number
   * of error findings — a percentage, a total that several findings summarise, a
   * count the body reports in one line rather than one line each.
   *
   * STATING IT ALSO CHANGES WHAT THE FINDINGS MEAN, and the distinction is the point:
   *
   *   - absent — the error findings ARE the debt. The ratchet tolerates up to that
   *     many of them, which is how a rule is armed against a tree that cannot satisfy
   *     it today. This is right for every check emitting one finding per violation.
   *   - present — the findings are FAILURES and the measurement is ratcheted apart
   *     from them. A check with both (coverage floors that must hold, plus a debt
   *     total that may only fall) cannot say that any other way, and collapsing the
   *     two would let a floor breach pass because the debt happened to be under its
   *     ceiling.
   */
  readonly measured?: number;
  /**
   * This run could not look, and why — what the check examines is not on this machine.
   * With no error finding, the check is reported as skipped (`cannot-tell`): not a pass,
   * not a failure, and the corpus floor is not applied, since nothing was there to count.
   */
  readonly skipped?: string;
}

export interface IDefineCheckOptions extends ICheckDeclaration {
  /** Which tier this runs in. Optional, defaulting to the cheapest — a check with no
   * stated schedule should run OFTEN rather than rarely. */
  readonly tier?: TTier;
  /** What the check may touch. Defaults to `read` — the only thing the overwhelming
   * majority of checks do, and the safest thing to have to opt OUT of. */
  readonly capabilities?: readonly TCapability[];
  /** The rule a finding is attributed to, when it is not the check's own id. */
  readonly ruleId?: string;
  /** When this check matters — a predicate, or the declarative form. Absent means
   * always. */
  readonly when?: TWhen;
  /**
   * The floor under the corpus: how many units this check must have examined for its
   * verdict to mean anything.
   *
   * WHY IT IS A HARD FAILURE AND NOT A WARNING. Every silent-success defect on record
   * has this shape — a path filter that matched no file, a package filter that
   * matched no package, a pattern that stopped matching after a format changed. In
   * every case the check ran, examined nothing, found nothing wrong, and reported
   * green, for months. The number is usually obvious (a repository that has any
   * markdown has more than one), and stating it converts the entire family from
   * invisible to loud.
   */
  readonly corpus?: { readonly atLeast: number; readonly why?: string };
  /**
   * Repair the findings, under `specwarden check --fix`. Declaring it adds the `write`
   * capability, because a check that repairs writes and a repository is entitled to
   * know which of its checks do.
   *
   * WHEN A CHECK MAY HAVE ONE: when the correct content is DERIVABLE rather than
   * chosen. A stale generated artifact qualifies — the generator's output is right by
   * definition. A layering violation does not: there are several correct repairs and
   * the check knows none of them, and a fix that guesses is worse than a failure that
   * names the file.
   *
   * The engine runs it only on a failing verdict, then re-runs the check, so what is
   * reported is what REMAINS rather than what was attempted.
   */
  readonly fix?: (ctx: ICheckContext) => IFixOutcome | Promise<IFixOutcome>;
  /** The body. It returns findings; it never builds a verdict and never prints. */
  readonly run: (ctx: ICheckContext) => TCheckOutcome | Promise<TCheckOutcome>;
}

/**
 * What the body returned, in the one shape the rest reads — or why it is not a shape
 * this can read. A body returning `undefined` (an arrow with braces and no `return`)
 * crashed the check with "reading 'unit'", which said nothing about the body.
 */
const normalise = (outcome: unknown): ICheckOutcome | string => {
  if (Array.isArray(outcome)) return { findings: outcome as IFinding[] };
  if (typeof outcome === 'object' && outcome !== null) return outcome as ICheckOutcome;
  return (
    `the body returned ${outcome === undefined ? 'nothing' : typeof outcome} — ` +
    'return an array of findings, or `{ findings, examined }`.'
  );
};

const SEVERITY = new Set<string>(SEVERITIES);

/**
 * Every finding carries the rule it proves, and a severity the verdict can count.
 *
 * The rule is stamped here rather than typed out per finding, which is where it was
 * forgotten or spelled differently. A severity that is missing — or not one of the three
 * — is read as `error`: a finding with none was printed and ignored by the verdict, so a
 * body reporting a defect was green beside it.
 */
const attribute = (findings: readonly IFinding[], ruleId: string): IFinding[] =>
  findings.map((f) => {
    const severity: TSeverity = SEVERITY.has(f.severity) ? f.severity : 'error';
    return { ...f, severity, ruleId: f.ruleId ?? ruleId };
  });

const failure = (ruleId: string, message: string, measured: number): IVerdict => ({
  ok: false,
  findings: [{ severity: 'error', ruleId, message }],
  ratchet: { value: measured },
});

export function defineCheck(options: IDefineCheckOptions): ICheck {
  checkOptions('defineCheck', options, {
    run: { kind: 'function', required: true },
    capabilities: { kind: 'array' },
    ruleId: { kind: 'string' },
    corpus: { kind: 'object' },
    fix: { kind: 'function' },
  });
  const direction = options.ratchetDirection ?? 'down';
  // A repair writes, so it declares `write` — added rather than demanded, because
  // forgetting it would hand the fix a writer that throws and turn a working repair
  // into a capability error nobody would read as one.
  const declared: readonly TCapability[] = options.capabilities ?? ['read'];
  const capabilities: readonly TCapability[] =
    options.fix !== undefined && !declared.includes('write') ? [...declared, 'write'] : declared;

  const check = buildCheck(
    options,
    capabilities,
    async (ctx: ICheckContext, self: ICheck): Promise<IVerdict> => {
      const ruleId = options.ruleId ?? self.id;
      const outcome = normalise(await options.run(ctx));
      if (typeof outcome === 'string') return failure(ruleId, `${self.id}: ${outcome}`, 0);
      const unit = outcome.unit ?? 'items';
      const findings = attribute(outcome.findings ?? [], ruleId);
      const errorCount = findings.filter((f) => f.severity === 'error').length;

      // A body that says it could not look is taken at its word — unless it also found a
      // defect, in which case it did look, and the verdict below decides.
      if (typeof outcome.skipped === 'string' && outcome.skipped.trim() !== '' && errorCount === 0) {
        const notes = (outcome.notes ?? []).map((message): IFinding => ({ severity: 'info', message }));
        return { ok: true, findings: [...notes, ...findings], skipped: outcome.skipped };
      }

      // Before anything else: did this check look at anything? A verdict over an
      // empty corpus is not a pass, it is an absence of evidence, and the two are
      // indistinguishable once printed.
      if (options.corpus !== undefined) {
        // A floor the body never reports against is no floor: a declared `corpus` over a
        // body returning a bare array passed over zero files, because there was no count
        // to hold it to.
        if (outcome.examined === undefined) {
          return failure(
            ruleId,
            `${self.id} declares \`corpus: { atLeast: ${options.corpus.atLeast} }\`, and its body reported no \`examined\` ` +
              'count, so the floor has nothing to hold. Return `{ findings, examined }` — how many units this run looked at.',
            outcome.measured ?? errorCount,
          );
        }
        if (outcome.examined < options.corpus.atLeast) {
          return failure(
            ruleId,
            `examined ${outcome.examined} ${unit}, below the declared floor of ${options.corpus.atLeast}. ` +
              (options.corpus.why ??
                'A check that examined nothing cannot fail, so it reports success — this is that state, caught. ' +
                  'Something upstream matched nothing: a path that moved, a pattern that stopped matching, a filter that selects no subject.'),
            outcome.measured ?? errorCount,
          );
        }
      }

      const measured = outcome.measured ?? errorCount;
      const threshold = ctx.ratchet ?? options.ratchet ?? 0;
      // A body that states its own measurement has said the findings are not the debt,
      // so an error finding fails regardless of where the measurement sits. See
      // `measured` for why collapsing these two would let a floor breach ride under a
      // debt ceiling that happened to hold.
      const ok =
        satisfiesRatchet(measured, threshold, direction) && (outcome.measured === undefined || errorCount === 0);

      const notes = (outcome.notes ?? []).map((message): IFinding => ({ severity: 'info', message }));
      // A pass with nothing to show prints as a blank line that reads as "did not
      // run". Saying what was examined is the cheapest evidence a green check can
      // offer, and it is the line that makes an empty corpus visible to a reader even
      // where no floor was declared.
      const clean: IFinding[] =
        ok && errorCount === 0
          ? [
              {
                severity: 'info',
                message:
                  `✓ ${self.id} — ${outcome.examined === undefined ? 'clean' : `${outcome.examined} ${unit} examined, clean`}` +
                  (outcome.measured === undefined ? '' : ` (measured ${measured}, ratchet ${threshold})`),
              },
            ]
          : [];

      const framed = frameTolerated(ok, [...clean, ...notes, ...findings], `ratchet ${threshold}`);
      return { ...framed, ratchet: { value: measured } };
    },
    resolveWhen(options.when),
  );

  return options.fix === undefined ? check : Object.assign(check, { fix: options.fix });
}
