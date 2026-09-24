/**
 * A perimeter policy — a prohibition computed BEFORE an agent acts, on the INTENT
 * of a single call, not after a change to the tree. It is a different execution
 * model from a check and must never share its roster: a check looks at the state
 * of the tree and runs in batches by tier; a perimeter policy looks at one intended
 * call and must answer in milliseconds.
 *
 * Two contractual invariants belong to the perimeter ENGINE (its own subplan), not
 * to any single policy, and are stated here so the interface is read with them: on
 * the perimeter's OWN failure it OPENS (allows) rather than blocks, and only a
 * definite block is a block — an error is not. A policy expresses just the verdict.
 */
/**
 * What an assistant is about to do, in terms a policy can judge.
 *
 * The fields below are SEMANTIC, and deliberately so: `command` means "this runs a
 * shell command", not "this tool is called Bash". A runtime adapter translates its
 * vendor's tool names into these; a policy reads only these and therefore survives the
 * assistant being swapped.
 *
 * That boundary was breached once and is worth stating: `commandPolicy` tested
 * `intent.tool !== 'Bash'` and `writePolicy` matched a set of Claude's tool names and
 * read `args.file_path`. Every policy a repository had written was, invisibly, a policy
 * about Claude Code — swapping the runtime would have left them all silently
 * inert, which is the worst way for a guard to fail.
 */
export interface IActionIntent {
  /** The tool or action about to run, in the runtime's own naming — for diagnostics
   * and for policies that genuinely are vendor-specific. Prefer the fields below. */
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
  /** The policy that blocked, when one did. */
  readonly policyId?: string;
}

/** The not-blocked verdict, shared so every "allow" path is identical. */
export const ALLOW: IPerimeterVerdict = { blocked: false };

export interface IPerimeterPolicy {
  readonly id: string;
  /** Decide the intent. Must be fast and total: it returns a verdict for every
   * intent rather than throwing, so the engine's open-on-failure rule is about the
   * engine, not about a policy that forgot a case. */
  evaluate(intent: IActionIntent): IPerimeterVerdict;
}
