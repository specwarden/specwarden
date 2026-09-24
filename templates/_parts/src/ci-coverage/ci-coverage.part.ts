import type { ITemplateContext } from 'specwarden';
import type { IPart } from '../_shared/part.model';
import { exampleRule, header, literal, switchOn, tierOption } from '../_shared/render.util';

/**
 * "Every heavy check has a CI job" — as an `.example`, and only where a workflow exists.
 *
 * Where there is NO workflow it is not written: it would reconcile the check roster against
 * an empty file. Where there is one it still ships switched off, because a workflow written
 * before specwarden existed names none of its checks, so it FAILS on the first run — the
 * check working, and the run that decides whether the tool is kept.
 *
 * The workflow is the one `init` found; the required job is a guess, and says so.
 */
export const ciCoverageExamplePart = (ctx: ITemplateContext): IPart => {
  if (ctx.ci !== 'github') return { files: [], rules: [] };
  const found = ctx.workflows?.[0];
  const workflow = found
    ? `  workflowFile: ${literal(found)},\n`
    : "  // REPLACE: the workflow file CI runs.\n  workflowFile: '.github/workflows/ci.yml',\n";
  return {
    files: [
      {
        path: 'checks/ops/ci-coverage.check.mjs.example',
        body: `${header(
          '`ci-coverage` — every heavy check is run by a CI job, and CI waits for it.',
          `Switched off because it fails until the workflow runs these checks: add the jobs first. A
check with no job never runs anywhere, and no evidence reads exactly like a pass.
${switchOn('ci-coverage')}`,
        )}
import { ciCoverage } from '@specwarden/ops';

export const check = ciCoverage({
  id: 'ci-coverage',
${tierOption(ctx)}${workflow}  // REPLACE: the job branch protection requires; every job that runs checks must be in its \`needs\`.
  requiredJob: 'ci-ok',
});
`,
      },
    ],
    rules: [exampleRule('ci-coverage', 'Every heavy check runs in CI, and the merge waits for it.')],
  };
};
