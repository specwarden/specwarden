/**
 * `plan-shape` — a plan is a plan, not an estimate.
 *
 * Phases express DEPENDENCY and DEPLOYABILITY — what must be true before the next thing
 * can start, and what can ship on its own. Not how much work fits in a sitting. A
 * sizing word ("2 hours", "5 points") is therefore a finding: it turns a work order
 * into a bid, and the bid is what people then argue about.
 *
 * Every phase carries an ACCEPTANCE COMMAND, because "phase 2 is done" is otherwise an
 * opinion. A `--id` an acceptance names must be a check that exists here — the roster
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
  tier: 'fast',
  plansDir: 'docs/_plans',
  // The legal plan filename shape.
  nameRe: /^[a-z0-9-]+\.md$/,
  allowedNonPlans: ['README.md'],
  // Phrases that only appear when a document SIZES work.
  sizingPatterns: [/\b\d+\s*(hours?|days?|weeks?)\b/i, /\bstory\s*points?\b/i, /\bt-?shirt\s*siz/i],
  // A phase heading, in whatever language this repository writes plans.
  phaseHeadingRe: /^##+\s+(?:Phase|Stage)\b/im,
  // Anything runnable that decides a phase is finished.
  commandRe: /^\s*(?:\$|>|```(?:bash|sh))/m,
});
