import type { IActionIntent, IAgentRuntime, IPerimeterVerdict } from '../../../domain';

/**
 * The Claude Code runtime adapter — the ONE place that knows Claude's hook payload
 * shape. Its format must not leak into the domain: prying it out later costs more
 * than keeping it here now. A second runtime gets its own adapter beside this one.
 */

/** The tools through which Claude Code writes a file. This set is the vendor's, and
 * it lives HERE for that reason: a rule that matched on these names was a rule about
 * Claude wearing the clothes of a rule about writing. */
const FILE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

/** Parse a Claude `PreToolUse` payload into a tool-call intent, or null when it is
 * not a recognizable tool call — in which case the perimeter has nothing to judge.
 *
 * Translation, not passthrough: Claude's `Bash` becomes a `command`, and its three
 * editing tools become a `writePath`, so every rule downstream reads semantics. */
export function parseClaudeToolCall(payload: unknown): IActionIntent | null {
  if (payload === null || typeof payload !== 'object') return null;
  const p = payload as { tool_name?: unknown; tool_input?: unknown };
  if (typeof p.tool_name !== 'string') return null;
  const input = (p.tool_input && typeof p.tool_input === 'object' ? p.tool_input : {}) as Record<string, unknown>;
  return {
    tool: p.tool_name,
    command: p.tool_name === 'Bash' && typeof input.command === 'string' ? input.command : undefined,
    writePath: FILE_TOOLS.has(p.tool_name) && typeof input.file_path === 'string' ? input.file_path : undefined,
    args: input,
  };
}

/**
 * The `PreToolUse` return-code contract: ONLY exit 2 blocks the call; every other
 * code is a non-blocking hook error. Combined with the engine's fail-open, this
 * guarantees a crash allows rather than blocks.
 */
export function perimeterExitCode(verdict: IPerimeterVerdict): 0 | 2 {
  return verdict.blocked ? 2 : 0;
}

/** The message shown to the model in place of a blocked call. */
export function formatBlock(verdict: IPerimeterVerdict): string {
  return (
    `\n🚫 Blocked by the perimeter: ${verdict.reason ?? verdict.policyId ?? 'a repository policy'}\n\n` +
    '   This is a repository rule, not a permission prompt — do not retry it verbatim and do\n' +
    '   not look for a wrapper around it. Read the owner document and take the path it names,\n' +
    '   or ask the operator to run the command themselves.\n'
  );
}

/**
 * The three functions above, as the `IAgentRuntime` port.
 *
 * Exported as a VALUE rather than a class so a consumer that wants Claude's behaviour
 * with one thing changed can spread it — `{ ...claudeAgentRuntime, formatBlock: mine }`
 * — instead of subclassing or copying all three.
 */
export const claudeAgentRuntime: IAgentRuntime = {
  name: 'claude-code',
  parse: parseClaudeToolCall,
  exitCode: perimeterExitCode,
  formatBlock,
};
