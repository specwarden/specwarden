import type { ITemplateContext } from 'specwarden';
import type { IPart } from '../_shared/part.model';
import { exampleRule, header, literal, switchOn, tierOption } from '../_shared/render.util';

/**
 * "Every heavy gate has a CI job" — as an `.example`, and only where a workflow exists.
 *
 * Where there is NO workflow it is not written: it would reconcile the gate roster against
 * an empty file. Where there is one it still ships switched off, because a workflow written
 * before the harness existed names none of its gates, so it FAILS on the first run — the
 * check working, and the run that decides whether the tool is kept.
 *
 * The workflow is the one `init` found; the arbiter job is a guess, and says so.
 */
export const ciCoveragePart = (ctx: ITemplateContext): IPart => {
  if (ctx.ci !== 'github') return { files: [], rules: [] };
  const found = ctx.workflows?.[0];
  const workflow = found
    ? `  workflow: ${literal(found)},\n`
    : "  // REPLACE: the workflow file CI runs.\n  workflow: '.github/workflows/ci.yml',\n";
  return {
    files: [
      {
        path: 'checks/harness/gate-coverage.check.mjs.example',
        body: `${header(
          '`gate-coverage` — every heavy gate is run by a CI job, and the arbiter job waits for it.',
          `OFF because it fails until the workflow runs these gates: add the jobs first. A gate with no
job never runs anywhere, and no evidence reads exactly like a pass.
${switchOn('gate-coverage')}`,
        )}
import { gatesHaveCiJobs } from '@specwarden/ops';

export const check = gatesHaveCiJobs({
  id: 'gate-coverage',
${tierOption(ctx)}${workflow}  // REPLACE: the job branch protection reads; every gate job must be in its \`needs\`.
  arbiterJob: 'ci-ok',
});
`,
      },
    ],
    rules: [exampleRule('gate-coverage', 'Every heavy gate runs in CI, and the merge waits for it.')],
  };
};
