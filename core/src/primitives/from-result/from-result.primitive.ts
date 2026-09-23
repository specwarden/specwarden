import {
  type ICheck,
  type ICheckContext,
  type ICheckDeclaration,
  type IFinding,
  type IFixOutcome,
  type IVerdict,
  type TCapability,
  type TTier,
  satisfiesRatchet,
} from '../../domain';
import { type TWhen, buildCheck, checkOptions, frameTolerated, resolveWhen } from '../_shared';

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
 * with no line number — deliberately: a location parsed out of a string is a guess at prose
 * the engine did not write, and a finding pointing at the wrong line is worse than one
 * pointing at none. A check written new wants findings — severities, locations, an
 * examined count — and `defineCheck` takes those. Sixteen checks in a corpus of real ones
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
  /** How many units the function looked at. What `corpus` is held to, and what a clean
   * pass prints: `✓ <id> — 4 files examined, clean`. */
  readonly examined?: number;
  /** What was examined, named — `files`, `manifests`. Defaults to `items`. */
  readonly unit?: string;
}

/** The keys a result may carry. Anything else is a shape this adapter would drop. */
const RESULT_KEYS: readonly string[] = ['errors', 'failures', 'notes', 'examined', 'unit'];

export interface IFromResultOptions extends ICheckDeclaration {
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
   * The floor under what the function looked at — the same declaration `defineCheck`
   * takes, and for the same reason: it passed over nothing with `✓ … clean`, because
   * there was no way to say how much it should have seen. The function reports
   * `examined`; a count below `atLeast`, or no count at all, is a failure.
   */
  readonly corpus?: { readonly atLeast: number; readonly why?: string };
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

/**
 * Why a function's return is not a result this adapter can read, or `undefined` when it
 * is. A bare array, a `{ problems: […] }`, an `undefined` from a forgotten `return` — each
 * was read as "no errors", and the check printed `✓ clean` over whatever the function had
 * found.
 */
function unreadable(result: unknown): string | undefined {
  if (Array.isArray(result)) {
    return 'returned an array — wrap it: `{ errors: [...] }` (or `failures`), so the adapter knows what the entries are.';
  }
  if (typeof result !== 'object' || result === null) {
    return `returned ${result === null ? 'null' : result === undefined ? 'nothing' : typeof result} — return \`{ errors: [...] }\`, empty when clean.`;
  }
  const unknown = Object.keys(result).filter((key) => !RESULT_KEYS.includes(key));
  if (unknown.length > 0) {
    return (
      `returned ${unknown.map((k) => `\`${k}\``).join(', ')}, which this adapter does not read — it reads ` +
      `${RESULT_KEYS.map((k) => `\`${k}\``).join(', ')}. Rename the key, or the problems under it are dropped.`
    );
  }
  return undefined;
}

export function fromResult(options: IFromResultOptions): ICheck {
  checkOptions('fromResult', options, {
    run: { kind: 'function', required: true },
    capabilities: { kind: 'array' },
    ruleId: { kind: 'string' },
    corpus: { kind: 'object' },
    fix: { kind: 'function' },
  });
  const declared: readonly TCapability[] = options.capabilities ?? ['read'];
  // A repair writes; adding the capability rather than demanding it keeps a working
  // fix from becoming a port that throws because somebody forgot one word.
  const capabilities: readonly TCapability[] =
    options.fix !== undefined && !declared.includes('write') ? [...declared, 'write'] : declared;

  const check = buildCheck(
    options,
    capabilities,
    async (ctx: ICheckContext, self: ICheck): Promise<IVerdict> => {
      const ruleId = options.ruleId ?? self.id;
      const result = (await options.run(ctx)) as unknown;
      const problem = unreadable(result);
      if (problem !== undefined) {
        return { ok: false, findings: [{ severity: 'error', message: `${self.id} ${problem}`, ruleId }] };
      }
      const plain = result as IPlainResult;
      const problems = plain.errors ?? plain.failures ?? [];
      const unit = plain.unit ?? 'items';

      if (options.corpus !== undefined && (plain.examined === undefined || plain.examined < options.corpus.atLeast)) {
        const message =
          plain.examined === undefined
            ? `${self.id} declares \`corpus: { atLeast: ${options.corpus.atLeast} }\`, and its function reported no ` +
              '`examined` count, so the floor has nothing to hold. Return `{ errors, examined }`.'
            : `examined ${plain.examined} ${unit}, below the declared floor of ${options.corpus.atLeast}. ` +
              (options.corpus.why ??
                'A check that examined nothing cannot fail, so it reports success — this is that state, caught.');
        return { ok: false, findings: [{ severity: 'error', message, ruleId }], ratchet: { value: problems.length } };
      }

      const findings: IFinding[] = problems.map((p) => toFinding(p, ruleId));
      for (const note of plain.notes ?? []) findings.push({ severity: 'info', message: note });

      // A verdict with no findings prints as a blank pass, which reads as "did not run" —
      // and it says what was examined when the function said, the line every primitive prints.
      if (problems.length === 0 && (findings.length === 0 || plain.examined !== undefined)) {
        findings.unshift({
          severity: 'info',
          message: `✓ ${self.id} — ${plain.examined === undefined ? 'clean' : `${plain.examined} ${unit} examined, clean`}`,
        });
      }

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
