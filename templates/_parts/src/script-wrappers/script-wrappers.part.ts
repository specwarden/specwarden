import type { ITemplateContext, ITemplateFile } from 'specwarden';

import type { IPart } from '../_shared/part.model';
import { header } from '../_shared/render.util';

/**
 * The linter and the test suite the repository ALREADY has, run through the harness —
 * wrapped rather than reimplemented, so the harness only decides when each runs.
 *
 * WRITTEN ONLY WHEN THE SCRIPT EXISTS. A wrapper generated blind fails on the first run
 * for a reason that has nothing to do with the repository's code, which is why this
 * reads the manifest's script list rather than assuming the two names every repository
 * "obviously" has. Each wrapper states its own rule, so a repository with only one of
 * the two scripts gets a register with no rule naming a check nobody wrote.
 */
export const scriptWrappersPart = (ctx: ITemplateContext): IPart => {
  const pm = ctx.packageManager ?? 'npm';
  const has = (script: string) => ctx.scripts.includes(script);

  const files: ITemplateFile[] = [];
  if (has('lint')) {
    files.push({
      path: 'checks/workspace/lint.check.mjs',
      body: `${header(
        '`lint` — the linter this repository already has, run through the harness.',
        'Heavy, because a type-aware config builds the whole program on every run; move it to the\nfast tier if yours is quick — nothing else depends on where it sits.',
      )}
import { commandCheck } from 'specwarden';

export const check = commandCheck({
  tier: 'heavy',
  cmd: '${pm} run lint',
  rule: 'Nothing merges while the linter is red.',
  hint: 'Fix the findings, or change the lint config deliberately — never silence a rule in passing.',
});
`,
    });
  }
  if (has('test')) {
    files.push({
      path: 'checks/workspace/unit.check.mjs',
      body: `${header(
        '`unit` — the test suite this repository already has, run through the harness.',
        'A suite that accepts `--shard=i/N` can say `shardable: true`; a shard sees only its own slice.',
      )}
import { commandCheck } from 'specwarden';

export const check = commandCheck({
  tier: 'heavy',
  cmd: '${pm} test',
  rule: 'Nothing merges while the test suite is red.',
  hint: 'A failing test is the finding. Read it before reading anything here.',
});
`,
    });
  }
  return { files, rules: [] };
};
