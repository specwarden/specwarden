import type { ITemplateContext } from 'specwarden';

import type { IPart } from '../_shared/part.model';

/**
 * "Every heavy gate has a CI job" — as an `.example`, and only where a workflow exists.
 *
 * TWO GATES ON IT, for two different reasons.
 *
 * Where there is NO workflow it is not written at all: it would reconcile the gate
 * roster against an empty file and report success, which is exactly the shape of
 * failure the harness exists to refuse. Detection is not a nicety here — it is the
 * difference between a check and a decoration.
 *
 * Where there IS one it still ships as an example, and this was learned the hard way:
 * generated live, it fails on the first run of every repository, because a workflow
 * written before the harness existed names none of the gates the harness just created.
 * Two of its three inputs are guesses as well — which job branch protection reads, and
 * how a gate invocation is spelled in that workflow. A check that fails a correct tree
 * teaches a team to skip the gate, and a skipped gate protects nothing.
 */
export const ciCoveragePart = (ctx: ITemplateContext): IPart => {
  if (ctx.ci !== 'github') return { files: [], rules: [] };
  return {
    files: [
      {
        path: 'checks/harness/gate-coverage.check.mjs.example',
        body: `/**
 * \`gate-coverage\` — every heavy gate is actually run by CI, and the arbiter waits for it.
 *
 * The defect it exists for: a gate is added, no job is added to the workflow, and it
 * never runs anywhere. Nothing is red — there is simply no evidence, which reads exactly
 * like a pass.
 *
 * WHY IT IS AN EXAMPLE. It will FAIL until CI runs your gates, which on day one it does
 * not: your workflow was written before this harness existed and names none of these
 * gates. That is the check working, and it is also a red first run, which is the run
 * that decides whether the tool is kept. So: add the jobs first, then rename this file.
 *
 * Three facts below are yours to confirm, and they are named rather than guessed:
 *
 *   workflow      the file CI runs.
 *   arbiterJob    the job branch protection reads. Every gate job must be in its
 *                 \`needs\`, or a red gate does not block a merge.
 *   runnerPattern how a gate invocation is spelled in that workflow. The scanner reads
 *                 \`gate: [a, b]\`, \`{ gate: a }\` and \`--id a\`; a fourth shape needs
 *                 adding to the module rather than worked around here.
 *
 * The roster it reconciles against is the RUN's own, taken from the context rather than
 * from a list somebody maintains: a hand-built list can forget a gate, and the forgotten
 * gate would then be invisible to the one audit meant to notice it.
 */
import { gatesHaveCiJobs } from '@specwarden/ops';

export const check = gatesHaveCiJobs({
  id: 'gate-coverage',
  title: 'every heavy gate has a CI job, and the arbiter needs it',
  tier: '${ctx.tier}',
  workflow: '.github/workflows/ci.yml',
  arbiterJob: 'ci-ok',
  // The tier this workflow owns. A gate of another tier named here runs on the wrong
  // schedule, or twice.
  ciTier: 'heavy',
  // The cheap tier some job must run anyway, because a client-side hook can be skipped.
  cheapTier: 'fast',
  runnerPattern: String.raw\`specwarden check --id (\\S+)\`,
  when: (changed) => changed.some((f) => f.startsWith('.github/workflows/') || f.includes('/checks/')),
  hint: 'Add the job, or move the gate to a tier this workflow does not own.',
});
`,
      },
    ],
    rules: [],
  };
};
