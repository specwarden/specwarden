import type { ICheck, ICheckIdentity, IFinding } from 'specwarden';
import { parseDecisionLog, rejectionsWithoutReason } from 'specwarden';
import { buildCheck, verdictFrom } from 'specwarden';

export interface IDecisionLogShapeOptions extends ICheckIdentity {
  /** git pathspec of the documents that may carry a decision log. */
  readonly docs: string;
  readonly ratchet?: number;
}

/**
 * A decision log states, for each decision, the alternatives it rejected AND why.
 * The one shape rule: a rejection carries a reason — a reason is an assertion, not
 * an apology, and a rejected alternative with its reason is exactly the fact that
 * lives only in the plan and is lost if archived without harvest.
 *
 * A PRODUCT check: the decision-log grammar is the product's; the corpus is an
 * option.
 */
export function decisionLogShape(options: IDecisionLogShapeOptions): ICheck {
  return buildCheck({ ...options, zone: 'product' }, ['read'], (ctx) => {
    const findings: IFinding[] = [];
    for (const file of ctx.vcs.trackedFiles(options.docs)) {
      const src = ctx.files.tryRead(file);
      if (src === undefined) continue;
      for (const r of rejectionsWithoutReason(parseDecisionLog(src))) {
        findings.push({ severity: 'error', file, line: r.line, message: `${file}:${r.line} — decision "${r.statement}" rejects "${r.alternative}" with no reason. State why: a rejection without a reason is the fact that gets lost.`, ruleId: options.id });
      }
    }
    return verdictFrom(findings, ctx.ratchet ?? options.ratchet);
  });
}
