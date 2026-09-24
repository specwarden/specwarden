import type { ITemplateContext } from 'specwarden';

import type { IPart } from '../_shared/part.model';
import { header, literal, tierOption } from '../_shared/render.util';

/** Where plans live, if the caller keeps them somewhere other than the default. */
export interface IPlanLifecycleOptions {
  readonly plansDir?: string;
  readonly archiveDir?: string;
}

/**
 * The plan LIFECYCLE — written, worked, harvested, archived — as three checks, all LIVE.
 *
 * A plan describes an intended future in the present tense, which a reader cannot tell
 * from a description of the present; a plan that outlives its work asserts a false present
 * in the one folder whose purpose is to be believed. Everything beyond the two folders is
 * the module's English default, and each header names the option that replaces it.
 */
export const planLifecyclePart = (ctx: ITemplateContext, o: IPlanLifecycleOptions = {}): IPart => {
  const plansDir = o.plansDir ?? 'docs/_plans';
  const archiveDir = o.archiveDir ?? 'docs/_plans-archive';
  return {
    files: [
      {
        path: 'checks/plans/plan-staleness.check.mjs',
        body: `${header(
          '`plan-staleness` — a finished plan leaves the live corpus, and nothing cites the archive.',
          'A plan that stays is read as current work. It reads a `**Status:**` / `**Branch:**` header;\nanother convention is `statusDeclaration` and `branchDeclaration`.',
        )}
import { planStaleness } from '@specwarden/plans';

export const check = planStaleness({
${tierOption(ctx)}  plansDir: ${literal(plansDir)},
  archiveDir: ${literal(archiveDir)},
  rule: 'A plan is archived when its work ends; nothing outside the archive cites it.',
});
`,
      },
      {
        path: 'checks/plans/plan-shape.check.mjs',
        body: `${header(
          '`plan-shape` — phases express dependency, not effort, and each says how it is accepted.',
          'A sizing word turns a work order into a bid. The phase heading, sizing and acceptance patterns\nare English defaults: `phaseHeading`, `sizing` and `command` replace them.',
        )}
import { planShape } from '@specwarden/plans';

export const check = planShape({
${tierOption(ctx)}  plansDir: ${literal(plansDir)},
  rule: 'Phases express dependency and deployability, and each names how it is accepted.',
});
`,
      },
      {
        path: 'checks/plans/decision-log-shape.check.mjs',
        body: `${header(
          '`decision-log-shape` — a rejected alternative carries the reason it was rejected.',
          'The reason is the one fact in a decision log that exists nowhere else. `docs` is what is read.',
        )}
import { decisionLogShape } from '@specwarden/plans';

export const check = decisionLogShape({
${tierOption(ctx)}  docs: ${literal(ctx.docs)},
  rule: 'A decision log states, for each rejected alternative, why it was rejected.',
});
`,
      },
    ],
    rules: [],
  };
};
