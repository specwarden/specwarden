/**
 * The decision log — the product owns its FORM (what was decided, which
 * alternatives were rejected, and why); the conversation that produces it stays a
 * repository skill, because a discussion cannot be standardised or machine-checked
 * and pretending otherwise is the check that cannot fail.
 *
 * The log closes the loop decision → plan → work → harvest → owning document. A
 * rejected alternative WITH its reason is exactly the fact that lives only in the
 * plan and is lost if it is archived without harvest — so the one thing the shape
 * enforces is that a rejection carries a reason. A reason is an assertion, not an
 * apology.
 *
 * The form, deliberately small:
 *
 *   ### Decision: <what was decided>
 *   - Rejected: <alternative> — <reason>
 *   - Rejected: <alternative> because <reason>
 */
export interface IRejectedAlternative {
  readonly alternative: string;
  readonly reason?: string;
}

export interface IDecision {
  readonly statement: string;
  readonly line: number;
  readonly rejected: readonly IRejectedAlternative[];
}

const DECISION_RE = /^#{1,6}\s+Decision:\s*(.+?)\s*$/;
const REJECTED_RE = /^\s*[-*]\s*Rejected:\s*(.+?)\s*$/i;

/** Split a rejected line into the alternative and its reason (after `—`, `--`, or
 * the word `because`). No separator → no reason, which the shape check flags. */
function splitReason(body: string): IRejectedAlternative {
  const dash = body.match(/^(.*?)\s+(?:—|--)\s+(.+)$/);
  if (dash) return { alternative: dash[1].trim(), reason: dash[2].trim() };
  const because = body.match(/^(.*?)\s+because\s+(.+)$/i);
  if (because) return { alternative: because[1].trim(), reason: because[2].trim() };
  return { alternative: body.trim() };
}

/** Parse the decision entries out of a document. Lines that are not part of the
 * grammar are simply not decisions — this parser reads a log embedded in a larger
 * plan, so unrelated prose is expected, not an error. */
export function parseDecisionLog(text: string): readonly IDecision[] {
  const lines = text.split('\n');
  const decisions: { statement: string; line: number; rejected: IRejectedAlternative[] }[] = [];
  let current: { statement: string; line: number; rejected: IRejectedAlternative[] } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const d = DECISION_RE.exec(lines[i]);
    if (d) {
      if (current) decisions.push(current);
      current = { statement: d[1].trim(), line: i + 1, rejected: [] };
      continue;
    }
    const r = current && REJECTED_RE.exec(lines[i]);
    if (r) current!.rejected.push(splitReason(r[1]));
  }
  if (current) decisions.push(current);
  return decisions;
}

/** The one shape rule: a rejected alternative must state why. Returns the offending
 * `{ line, alternative }` entries. */
export function rejectionsWithoutReason(
  decisions: readonly IDecision[],
): ReadonlyArray<{ statement: string; line: number; alternative: string }> {
  const out: { statement: string; line: number; alternative: string }[] = [];
  for (const d of decisions) {
    for (const r of d.rejected) {
      if (!r.reason) out.push({ statement: d.statement, line: d.line, alternative: r.alternative });
    }
  }
  return out;
}
