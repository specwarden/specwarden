import type { ITemplateContext } from 'specwarden';

import type { IPart } from '../_shared/part.model';

/** Where plans live, if the caller keeps them somewhere other than the default. */
export interface IPlanLifecycleOptions {
  readonly plansDir?: string;
  readonly archiveDir?: string;
}

/**
 * The plan LIFECYCLE — written, worked, harvested, archived — as three checks.
 *
 * A plan describes an intended future in the PRESENT TENSE, which is exactly what a
 * reader cannot distinguish from a description of the present. So a plan that outlives
 * its work does not go quietly out of date: it asserts a false present, in the one
 * folder whose purpose is to be believed.
 *
 * All three ship LIVE. Everything they need beyond the two directories either carries a
 * default convention (`plan-staleness`) or is spelled out in the generated file where
 * the reader can see and change it (`plan-shape`) — the pattern this whole scaffold
 * follows: a value that decides whether a check finds anything is never invisible.
 */
export const planLifecyclePart = (ctx: ITemplateContext, o: IPlanLifecycleOptions = {}): IPart => {
  const plansDir = o.plansDir ?? 'docs/_plans';
  const archiveDir = o.archiveDir ?? 'docs/_plans-archive';
  return {
    files: [
      {
        path: 'checks/plans/plan-staleness.check.mjs',
        body: `/**
 * \`plan-staleness\` — a finished plan leaves the live corpus.
 *
 * A plan is ephemeral by construction: written, worked, harvested into the documents
 * that own its durable facts, then archived. One that stays is read as current work,
 * and anybody — a person, an agent — asked "what are we doing" answers with something
 * that shipped in March.
 *
 * THE DEFAULT CONVENTION is a bolded-markdown header, which is what a plan written by
 * hand already looks like:
 *
 *     **Status:** active
 *     **Branch:** feature/thing
 *
 * If yours differs, pass \`statusDeclaration\` / \`branchDeclaration\` / \`activeStatuses\`
 * / \`archiveHeader\` — the module exports its defaults as DEFAULT_* to start from.
 *
 * Delete this file if you do not plan in the repository. An inert check is worse than
 * an absent one: it looks like coverage.
 */
import { planStaleness } from '@specwarden/plans';

export const check = planStaleness({
  id: 'plan-staleness',
  title: 'a finished plan is archived, and nothing cites the archive',
  tier: '${ctx.tier}',
  plansDir: '${plansDir}',
  archiveDir: '${archiveDir}',
});
`,
      },
      {
        path: 'checks/plans/plan-shape.check.mjs',
        body: `/**
 * \`plan-shape\` — a plan is a plan, not an estimate.
 *
 * Phases express DEPENDENCY and DEPLOYABILITY — what must be true before the next thing
 * can start, and what can ship on its own. Not how much work fits in a sitting. A
 * sizing word ("2 hours", "5 points") is therefore a finding: it turns a work order
 * into a bid, and the bid is what people then argue about.
 *
 * Every phase carries an ACCEPTANCE COMMAND, because "phase 2 is done" is otherwise an
 * opinion. A \`--id\` an acceptance names must be a check that exists here — the roster
 * is read from the run itself, so a renamed gate fails the plan rather than failing
 * mysteriously at acceptance time.
 *
 * The four patterns are English and are HERE rather than hidden in a default, so a
 * repository writing plans in another language can see exactly what to replace.
 */
import { planShape } from '@specwarden/plans';

export const check = planShape({
  id: 'plan-shape',
  title: 'a plan expresses dependency, and every phase says how it is accepted',
  tier: '${ctx.tier}',
  plansDir: '${plansDir}',
  // The legal plan filename shape.
  nameRe: /^[a-z0-9-]+\\.md$/,
  allowedNonPlans: ['README.md'],
  // Phrases that only appear when a document SIZES work.
  sizingPatterns: [/\\b\\d+\\s*(hours?|days?|weeks?)\\b/i, /\\bstory\\s*points?\\b/i, /\\bt-?shirt\\s*siz/i],
  // A phase heading, in whatever language this repository writes plans.
  phaseHeadingRe: /^##+\\s+(?:Phase|Stage)\\b/im,
  // Anything runnable that decides a phase is finished.
  commandRe: /^\\s*(?:\\$|>|\`\`\`(?:bash|sh))/m,
});
`,
      },
      {
        path: 'checks/plans/decision-log-shape.check.mjs',
        body: `/**
 * \`decision-log-shape\` — a rejected alternative carries the reason it was rejected.
 *
 * The reason is the one fact in a decision log that exists nowhere else. The decision
 * itself ends up in the code; what was considered and DISCARDED, and why, survives only
 * here — and it is the first thing someone reopening the question needs, six months
 * later, usually to propose the rejected option again.
 *
 * A reason is an assertion, not an apology. "Too slow" is a reason; "we did not have
 * time" is a schedule.
 */
import { decisionLogShape } from '@specwarden/plans';

export const check = decisionLogShape({
  id: 'decision-log-shape',
  title: 'every rejected alternative says why',
  tier: '${ctx.tier}',
  docs: '${ctx.docs}',
});
`,
      },
    ],
    rules: [
      {
        id: 'a-finished-plan-leaves-the-live-corpus',
        statement: 'A plan is archived when its work ends; nothing outside the archive cites it.',
        owner: '',
        enforcement: { checkIds: ['plan-staleness'] },
      },
      {
        id: 'a-plan-expresses-dependency-not-effort',
        statement: 'Phases express dependency and deployability, and each names how it is accepted.',
        owner: '',
        enforcement: { checkIds: ['plan-shape'] },
      },
      {
        id: 'a-rejection-carries-its-reason',
        statement: 'A decision log states, for each rejected alternative, why it was rejected.',
        owner: '',
        enforcement: { checkIds: ['decision-log-shape'] },
      },
    ],
  };
};
