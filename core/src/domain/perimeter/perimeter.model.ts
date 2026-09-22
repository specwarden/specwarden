/**
 * A perimeter rule — a prohibition computed BEFORE an agent acts, on the INTENT
 * of a single call, not after a change to the tree. It is a different execution
 * model from a check and must never share its registry: a check looks at the state
 * of the tree and runs in batches by tier; a perimeter rule looks at one intended
 * call and must answer in milliseconds.
 *
 * Two contractual invariants belong to the perimeter ENGINE (its own subplan), not
 * to any single rule, and are stated here so the interface is read with them: on
 * the perimeter's OWN failure it OPENS (allows) rather than blocks, and only a
 * definite block is a block — an error is not. A rule expresses just the verdict.
 */
/**
 * What an assistant is about to do, in terms a rule can judge.
 *
 * The fields below are SEMANTIC, and deliberately so: `command` means "this runs a
 * shell command", not "this tool is called Bash". A runtime adapter translates its
 * vendor's tool names into these; a rule reads only these and therefore survives the
 * assistant being swapped.
 *
 * That boundary was breached once and is worth stating: `commandRule` tested
 * `intent.tool !== 'Bash'` and `writeRule` matched a set of Claude's tool names and
 * read `args.file_path`. Every rule a repository had written was, invisibly, a rule
 * about Claude Code — swapping the runtime would have left them all silently
 * inert, which is the worst way for a guard to fail.
 */
export interface IActionIntent {
  /** The tool or action about to run, in the runtime's own naming — for diagnostics
   * and for rules that genuinely are vendor-specific. Prefer the fields below. */
  readonly tool: string;
  /** The command line, when the action runs a shell command. */
  readonly command?: string;
  /** The path being written, when the action writes a file. */
  readonly writePath?: string;
  /** Structured arguments, as the runtime received them. */
  readonly args?: Readonly<Record<string, unknown>>;
}

export interface IPerimeterVerdict {
  readonly blocked: boolean;
  /** Why, when blocked — shown to the agent in place of the action. */
  readonly reason?: string;
  /** The rule that blocked, when one did. */
  readonly ruleId?: string;
}

/** The not-blocked verdict, shared so every "allow" path is identical. */
export const ALLOW: IPerimeterVerdict = { blocked: false };

export interface IPerimeterRule {
  readonly id: string;
  /** Decide the intent. Must be fast and total: it returns a verdict for every
   * intent rather than throwing, so the engine's open-on-failure rule is about the
   * engine, not about a rule that forgot a case. */
  evaluate(intent: IActionIntent): IPerimeterVerdict;
}
