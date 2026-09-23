import type { IFinding, IPlan, IPlanPhase, TPlanStatus } from '../../../domain';
import { PLAN_STATUSES } from '../../../domain';

/**
 * The plan parser. Markdown stays the source — a readable artifact must not become
 * a derivative of YAML — and the price is that the shape of a plan becomes a
 * grammar. The risk that buys is contained by the rule the rest of the harness
 * already runs on: an unparsed structural line is a FINDING, not a silent skip. A
 * parser that sees half and says nothing is exactly the check that cannot fail.
 *
 * The anchor is the ACCEPTANCE COMMAND, not a checkbox: a phase without one has no
 * definition of done, which is the concrete thing this parser complains about.
 *
 * ONE ACCEPTANCE CONVENTION, the one `@specwarden/plans`' plan-shape reads too: a phase's
 * acceptance is an `**Acceptance.**` (or `**Acceptance:**`) line, OR a fenced `bash`/`sh`
 * block under the phase heading — whichever comes first. The parser read only the line
 * while plan-shape, as templates configure it, read only the block, so a plan written the
 * way a template's own example shows passed one and was "no acceptance at all" to the
 * other. An inline acceptance written as markdown writes a command — in backticks — has
 * them stripped: the shell reads `…` as command substitution, and the phase failed for
 * reasons that were not the phase's.
 *
 * The keywords are English and only English. A plan vocabulary in another language is a
 * house's decision, and the engine carries no house's decisions: a repository whose plans
 * are written otherwise checks them with `@specwarden/plans`, whose patterns it supplies.
 */

const STATUS_RE = new RegExp(`^\\*\\*Status:\\*\\*\\s*\`?(${PLAN_STATUSES.join('|')})\`?`, 'im');
const BRANCH_RE = /^\*\*Branch:\*\*\s*`?([^\s`]+)`?/im;
const PHASE_RE = /^##\s+Phase\s+(\S+?)\s*[—–-]\s*(.+?)\s*$/;
const ACCEPTANCE_RE = /^\*\*Acceptance(?:\.|:|\.:)?\*\*:?\s*(.+?)\s*$/;
const FENCE_OPEN_RE = /^\s*```\s*(bash|sh|shell)\s*$/;
const FENCE_CLOSE_RE = /^\s*```\s*$/;
/** A heading that closes the phase: any `#` or `##` that is not itself a phase. A `###`
 * inside a phase (a decision, say) stays part of it. */
const SECTION_RE = /^#{1,2}\s/;

export interface IParsedPlan {
  readonly plan: IPlan;
  readonly findings: readonly IFinding[];
  /** The status the plan DECLARES, or `undefined` when it declares none. `plan.status`
   * carries a value either way, for the type; a reader that prints the status reads this
   * one, so an undeclared status is never reported as `draft`. */
  readonly declared?: TPlanStatus;
}

/** An inline acceptance with the inline-code delimiters a markdown author writes around
 * a command taken off: `` `pnpm test` `` → `pnpm test`. */
export function unquoteCommand(text: string): string {
  const trimmed = text.trim();
  const fence = /^`+/.exec(trimmed)?.[0];
  if (fence === undefined || trimmed.length <= fence.length * 2 || !trimmed.endsWith(fence)) return trimmed;
  const inner = trimmed.slice(fence.length, -fence.length);
  // Only a WRAPPING pair: `a` and `b` is two spans of code in prose, not one command.
  if (inner.startsWith('`') || inner.endsWith('`') || inner.includes(fence)) return trimmed;
  return inner.trim();
}

/** The command a fenced block runs: its lines, continuations joined, blank and comment
 * lines dropped, the rest chained so the first failure fails the whole block. */
function fencedCommand(lines: readonly string[]): string | undefined {
  const joined = lines.join('\n').replace(/\s*\\\r?\n\s*/g, ' ');
  const commands = joined
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
  return commands.length === 0 ? undefined : commands.join(' && ');
}

/**
 * Parse a plan's machine-readable structure: its status, branch, and phases with
 * their acceptance commands. Returns the plan AND the findings that explain what it
 * could not make sense of; a caller treats any error finding as a failed parse
 * rather than trusting a partial result.
 */
export function parsePlan(markdown: string, ruleId = 'plan-parse'): IParsedPlan {
  const lines = markdown.split(/\r?\n/);
  const findings: IFinding[] = [];

  const declared = STATUS_RE.exec(markdown)?.[1]?.toLowerCase() as TPlanStatus | undefined;
  if (declared === undefined) {
    findings.push({
      severity: 'error',
      message: `plan declares no \`**Status:**\` (${PLAN_STATUSES.join(', ')})`,
      ruleId,
    });
  }
  const branch = BRANCH_RE.exec(markdown)?.[1];

  const phases: Array<{ title: string; acceptance?: string; line: number }> = [];
  let current: { title: string; acceptance?: string; line: number } | undefined;
  // An open fence remembers the phase it opened in, so its close needs no second look.
  let fence: { phase: { acceptance?: string }; lines: string[] } | undefined;
  lines.forEach((line, i) => {
    if (fence !== undefined) {
      if (!FENCE_CLOSE_RE.test(line)) {
        fence.lines.push(line);
        return;
      }
      fence.phase.acceptance = fencedCommand(fence.lines);
      fence = undefined;
      return;
    }
    const phase = PHASE_RE.exec(line);
    if (phase) {
      if (current) phases.push(current);
      current = { title: phase[2], line: i + 1 };
      return;
    }
    if (!current) return;
    if (SECTION_RE.test(line)) {
      phases.push(current);
      current = undefined;
      return;
    }
    if (current.acceptance !== undefined) return;
    const acceptance = ACCEPTANCE_RE.exec(line);
    if (acceptance) current.acceptance = unquoteCommand(acceptance[1]);
    else if (FENCE_OPEN_RE.test(line)) fence = { phase: current, lines: [] };
  });
  if (current) phases.push(current);

  for (const phase of phases) {
    if (phase.acceptance === undefined) {
      findings.push({
        severity: 'error',
        line: phase.line,
        message:
          `phase "${phase.title}" names no acceptance command — a phase without one has no definition of done. ` +
          'Write an `**Acceptance.**` line, or a fenced `bash` block under the heading.',
        ruleId,
      });
    }
  }

  const plan: IPlan = {
    status: declared ?? 'draft',
    branch,
    phases: phases.map((p): IPlanPhase => ({ title: p.title, acceptance: p.acceptance })),
  };
  return { plan, findings, declared };
}
