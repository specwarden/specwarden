import type { IPlan } from '../../../domain';

/**
 * Render a plan back to its canonical markdown. This exists to make reversibility
 * a PROPERTY rather than a hope: for any valid plan, `parse → render → parse` is
 * the same plan. A lossy parse fails that test here, not in the field.
 *
 * It is the canonical form, not a pretty-printer for arbitrary prose plans — the
 * roundtrip is over what the parser treats as structure (status, branch, phases
 * and their acceptance), which is precisely what must not be lost.
 */
export function renderPlan(plan: IPlan): string {
  const out: string[] = [`**Status:** ${plan.status}`];
  if (plan.branch !== undefined) out.push(`**Branch:** ${plan.branch}`);
  out.push('');
  plan.phases.forEach((phase, i) => {
    out.push(`## Phase ${i + 1} — ${phase.title}`, '');
    if (phase.acceptance !== undefined) out.push(`**Acceptance.** ${phase.acceptance}`, '');
  });
  return out.join('\n');
}
