import type { ICheck, IFinding } from 'specwarden';
import { parseDecisionLog, rejectionsWithoutReason } from 'specwarden';
import { buildCheck, checkOptions, verdictFrom } from 'specwarden';
import { DEFAULT_PLANS_DIR, type IPlanCheckIdentity } from '../_shared/identity/identity.model';

export interface IDecisionLogShapeOptions extends IPlanCheckIdentity {
  /** git pathspec of the documents that may carry a decision log. Default: the plans in
   * `docs/_plans`, `docs/_plans/*.md`. */
  readonly docs?: string;
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
  checkOptions('decisionLogShape', options, { docs: { kind: 'string' } });
  const pathspec = options.docs ?? `${DEFAULT_PLANS_DIR}/*.md`;

  return buildCheck(
    {
      ...options,
      rule: options.rule ?? {
        statement: 'a decision names the alternatives it rejected, each with its reason',
        owner: '@specwarden/plans',
        implied: true,
      },
      tier: options.tier ?? 'fast',
      zone: 'product',
    },
    ['read'],
    (ctx) => {
      const findings: IFinding[] = [];
      const docs = ctx.vcs.trackedFiles(pathspec);
      // Zero documents is a failure, not a clean run: a `docs` pathspec left pointing at a
      // folder that moved would otherwise report every rejection reasoned, over none.
      if (docs.length === 0) {
        return {
          ok: false,
          findings: [
            {
              severity: 'error',
              ruleId: options.id,
              message: `no document matched \`${pathspec}\` — this check examined nothing, and a check that examined nothing cannot fail.`,
            },
          ],
        };
      }
      for (const file of docs) {
        const src = ctx.files.tryRead(file);
        if (src === undefined) continue;
        for (const r of rejectionsWithoutReason(parseDecisionLog(src))) {
          findings.push({
            severity: 'error',
            file,
            line: r.line,
            message: `${file}:${r.line} — decision "${r.statement}" rejects "${r.alternative}" with no reason. State why: a rejection without a reason is the fact that gets lost.`,
            ruleId: options.id,
          });
        }
      }
      return verdictFrom(findings, ctx.ratchet ?? options.ratchet);
    },
  );
}
