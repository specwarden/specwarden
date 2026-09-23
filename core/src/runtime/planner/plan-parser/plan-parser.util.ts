import type { IFinding, IPlan, IPlanPhase, TPlanStatus } from '../../../domain';

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
 * The keywords are English and only English. A plan vocabulary in another language is a
 * house's decision, and the engine carries no house's decisions: a repository whose plans
 * are written otherwise checks them with `@specwarden/plans`, whose patterns it supplies.
 */

const STATUS_RE = /^\*\*Status:\*\*\s*`?(draft|active)`?/im;
const BRANCH_RE = /^\*\*Branch:\*\*\s*`?([^\s`]+)`?/im;
const PHASE_RE = /^##\s+Phase\s+(\S+?)\s*[—–-]\s*(.+?)\s*$/;
const ACCEPTANCE_RE = /^\*\*Acceptance\.?:?\*\*\s*(.+?)\s*$/;

export interface IParsedPlan {
  readonly plan: IPlan;
  readonly findings: readonly IFinding[];
}

function normalizeStatus(raw: string | undefined): TPlanStatus | undefined {
  if (raw === undefined) return undefined;
  const lower = raw.toLowerCase();
  if (lower === 'draft') return 'draft';
  if (lower === 'active') return 'active';
  return undefined;
}

/**
 * Parse a plan's machine-readable structure: its status, branch, and phases with
 * their acceptance commands. Returns the plan AND the findings that explain what it
 * could not make sense of; a caller treats any error finding as a failed parse
 * rather than trusting a partial result.
 */
export function parsePlan(markdown: string, ruleId = 'plan-parse'): IParsedPlan {
  const lines = markdown.split('\n');
  const findings: IFinding[] = [];

  const status = normalizeStatus(STATUS_RE.exec(markdown)?.[1]);
  if (status === undefined) {
    findings.push({ severity: 'error', message: 'plan declares no `**Status:**` (draft or active)', ruleId });
  }
  const branch = BRANCH_RE.exec(markdown)?.[1];

  const phases: Array<{ title: string; acceptance?: string; line: number }> = [];
  let current: { title: string; acceptance?: string; line: number } | undefined;
  lines.forEach((line, i) => {
    const phase = PHASE_RE.exec(line);
    if (phase) {
      if (current) phases.push(current);
      current = { title: phase[2], line: i + 1 };
      return;
    }
    if (current && current.acceptance === undefined) {
      const acceptance = ACCEPTANCE_RE.exec(line);
      if (acceptance) current.acceptance = acceptance[1];
    }
  });
  if (current) phases.push(current);

  for (const phase of phases) {
    if (phase.acceptance === undefined) {
      findings.push({
        severity: 'error',
        line: phase.line,
        message: `phase "${phase.title}" names no acceptance command — a phase without one has no definition of done`,
        ruleId,
      });
    }
  }

  const plan: IPlan = {
    status: status ?? 'draft',
    branch,
    phases: phases.map((p): IPlanPhase => ({ title: p.title, acceptance: p.acceptance })),
  };
  return { plan, findings };
}
