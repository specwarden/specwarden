import type { IActionIntent, IPerimeterVerdict } from '../../perimeter/perimeter.model';

/**
 * The coding agent the perimeter guards, behind a port.
 *
 * WHY THIS IS A PORT. The perimeter decides whether an action is allowed; a runtime
 * decides how that decision is spoken. Those are different jobs, and only the second
 * one is vendor-shaped: the payload arrives in whatever the tool emits, the refusal
 * has to be phrased in whatever the tool shows the model, and the exit code has to
 * mean what that tool's hook contract says it means — Claude Code blocks on exit 2
 * and treats every other code as a harness error, which is a decision Claude made,
 * not a fact about perimeters.
 *
 * Welding one vendor in would have made the whole feature useless to anyone using a
 * different assistant, while the RULES — never force-push, never drop a volume — are
 * the part that has nothing to do with which model is typing.
 *
 * A house running its own model implements this against its own hook format and
 * declares it in `config.agentRuntime`. Three small methods, none of which need to
 * know what a rule is.
 */
export interface IAgentRuntime {
  /** A name for diagnostics — printed when a payload cannot be parsed. */
  readonly name: string;

  /**
   * Read this runtime's hook payload into a tool-call intent, or `null` when the
   * payload is not a tool call this perimeter can judge.
   *
   * Returning `null` must mean "nothing to judge", never "I could not parse it":
   * the engine fails OPEN, so an unparsed payload allows the action. That is the
   * right default — a broken guard must not become a broken agent — and it is why
   * a runtime should be strict about what it recognises rather than guessing.
   */
  parse(payload: unknown): IActionIntent | null;

  /**
   * The process exit code for a verdict, in this runtime's hook contract.
   *
   * Claude Code: 2 blocks, anything else does not. Another tool may invert that, or
   * use a different number — which is exactly why the engine does not hardcode it.
   */
  exitCode(verdict: IPerimeterVerdict): number;

  /** What the model is shown in place of the blocked call. */
  formatBlock(verdict: IPerimeterVerdict): string;
}
