import {
  type ICheck,
  type ICheckContext,
  type ICheckIdentity,
  type IFinding,
  type IFixOutcome,
  type IVerdict,
  type TCapability,
  type TTier,
  satisfiesRatchet,
} from '../../domain';
import { type TWhen, buildCheck, frameTolerated, resolveWhen } from '../_shared';

/**
 * Adapt a plain function that returns a list of problems into a check.
 *
 * WHY THE ENGINE OWNS THIS. Most checks a repository already has are not written against a
 * port contract — they are functions that read something and return what is wrong with it.
 * Rewriting each one to build findings by hand is how a repository ends up with as many
 * finding shapes as it has checks, and a reporter that renders half of them well.
 *
 * The three input shapes below are not a design; they are what such functions really
 * return, collected from a corpus of twenty. Accepting all three is what let twenty checks
 * move behind one contract without any of them being rewritten — and a rewrite is exactly
 * where a verdict quietly changes.
 *
 * It is mechanics, not knowledge: nothing here knows what is being checked, only how to
 * carry an answer. The caller supplies the identity and the predicate, both of which are
 * facts about the consumer.
 *
 * WHEN TO REACH FOR `defineCheck` INSTEAD. This adapter exists to carry a function that
 * already exists, in the shape it already has, and it flattens everything to an `error`
 * with no line number. A check written new wants findings — severities, locations, an
 * examined count — and `defineCheck` takes those. Sixteen checks in the first consumer
 * abandoned this adapter for a hand-written object literal, and every one of them did so
 * for something the literal could express and this could not.
 */

/** A problem, in any of the shapes a plain check function returns. */
export type TProblem =
  | string
  | { readonly file?: string; readonly message: string }
  | { readonly where?: string; readonly what?: string; readonly fix?: string };

/**
 * What such a function returns. `errors` and `failures` are the same thing under two names
 * — both are accepted because both exist in the wild, and forcing one would mean editing
 * every function to satisfy the adapter rather than the reverse.
 */
export interface IPlainResult {
  readonly errors?: readonly TProblem[];
  readonly failures?: readonly TProblem[];
  /** Context worth printing that is NOT a failure — "checked 4 env files", "SKIPPED, this
   * checkout has no refs". These become info findings so a passing run can still explain
   * what it looked at; a check that says only "ok" cannot be distinguished from one that
   * examined nothing. */
  readonly notes?: readonly string[];
}

export interface IFromResultOptions extends Omit<ICheckIdentity, 'tier'> {
  /** Which tier this runs in. Optional, defaulting to the cheapest — a check with no
   * stated schedule should run OFTEN rather than rarely. */
  readonly tier?: TTier;
  /** What the check may touch. Defaults to `read`. A plain function that shells out
   * needs `exec` here, or the runner hands it a process port that throws. */
  readonly capabilities?: readonly TCapability[];
  /** The rule this check enforces, when it is not the check's own id. */
  readonly ruleId?: string;
  /** When this check matters — a predicate over the changed set, or the declarative
   * form. Absent means always relevant. */
  readonly when?: TWhen;
  /**
   * Repair the findings, under `--fix`. Declaring it adds the `write` capability.
   *
   * It is here for the same reason the adapter is: a repository that already has a
   * function producing the correct content should be able to offer the repair without
   * first being rewritten into another shape. The rule for when a check MAY have one is
   * `defineCheck`'s — the correct content must be derivable, never chosen.
   */
  readonly fix?: (ctx: ICheckContext) => IFixOutcome | Promise<IFixOutcome>;
  /**
   * The plain function. It receives the check CONTEXT — the ports — and nothing else; a
   * function that ignores the argument is still a valid one, which is how every existing
   * caller keeps working. What it does NOT receive is a repository root: a root passed in
   * from outside is a root that changes when the CALLER moves, and that defect is on
   * record — ten bodies that computed `..`/`..` from their own file pointed into the
   * wrong folder the day they moved. Read through `ctx.files` and `ctx.vcs` instead.
   */
  readonly run: (ctx: ICheckContext) => IPlainResult | Promise<IPlainResult>;
}

const toFinding = (problem: TProblem, ruleId: string): IFinding => {
  if (typeof problem === 'string') return { severity: 'error', message: problem, ruleId };
  if ('message' in problem && problem.message !== undefined) {
    return { severity: 'error', file: problem.file, message: problem.message, ruleId };
  }
  const { where, what, fix } = problem as { where?: string; what?: string; fix?: string };
  const message = [what, fix].filter(Boolean).join(' → ') || JSON.stringify(problem);
  return { severity: 'error', file: where, message, ruleId };
};

export function fromResult(options: IFromResultOptions): ICheck {
  const ruleId = options.ruleId ?? options.id;
  const declared: readonly TCapability[] = options.capabilities ?? ['read'];
  // A repair writes; adding the capability rather than demanding it keeps a working
  // fix from becoming a port that throws because somebody forgot one word.
  const capabilities: readonly TCapability[] =
    options.fix !== undefined && !declared.includes('write') ? [...declared, 'write'] : declared;

  const check = buildCheck(
    { ...options, tier: options.tier ?? 'fast' },
    capabilities,
    async (ctx: ICheckContext): Promise<IVerdict> => {
      const result = await options.run(ctx);
      const problems = result.errors ?? result.failures ?? [];
      const findings: IFinding[] = problems.map((problem) => toFinding(problem, ruleId));

      for (const note of result.notes ?? []) findings.push({ severity: 'info', message: note });

      // A verdict with no findings prints as a blank pass, which reads as "did not run".
      if (findings.length === 0) findings.push({ severity: 'info', message: `✓ ${options.id} clean` });

      // The threshold a stored ratchet supplies wins over the inline one, which is the
      // value the check was armed at. Both absent means strict.
      const threshold = ctx.ratchet ?? options.ratchet ?? 0;
      const framed = frameTolerated(satisfiesRatchet(problems.length, threshold), findings, `ratchet ${threshold}`);
      // Stated, not inferred. The count here is the PROBLEM count rather than the error
      // findings, and the two are the same today — but they are the same by construction,
      // not by coincidence, and saying so is what keeps `--tighten` from re-deriving it.
      return { ...framed, ratchet: { value: problems.length } };
    },
    resolveWhen(options.when),
  );

  return options.fix === undefined ? check : Object.assign(check, { fix: options.fix });
}
