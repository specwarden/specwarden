import type { IRule, ITemplateContext, ITemplateFile } from 'specwarden';

import type { IPart } from '../_shared/part.model';

/**
 * The linter and the test suite the repository ALREADY has, run through the harness.
 *
 * Wrapped rather than reimplemented: the suite is the repository's, and the harness
 * only decides when it runs and reports its verdict beside every other gate.
 *
 * WRITTEN ONLY WHEN THE SCRIPT EXISTS. A wrapper generated blind fails on the first run
 * for a reason that has nothing to do with the repository's code — and the first run is
 * what decides whether the tool is kept. That is why this takes the manifest's script
 * list rather than assuming the two names every repository "obviously" has.
 */
export const scriptWrappersPart = (ctx: ITemplateContext): IPart => {
  const pm = ctx.packageManager ?? 'npm';
  const has = (script: string) => ctx.scripts.includes(script);

  const files: ITemplateFile[] = [];
  if (has('lint')) {
    files.push({
      path: 'checks/workspace/lint.check.mjs',
      body: `/**
 * \`lint\` — the linter this repository already has, run through the harness.
 *
 * HEAVY rather than fast, and that is a judgement: a type-aware config builds the whole
 * program on every invocation, so file count barely matters and there is no cheap "lint
 * only what changed". Move it to the fast tier if yours is quick — nothing else depends
 * on where it sits.
 */
import { commandCheck } from 'specwarden';

export const check = commandCheck({
  id: 'lint',
  title: 'the linter passes',
  tier: 'heavy',
  cmd: '${pm} run lint',
  when: () => true,
  hint: 'Fix the findings, or change the lint config deliberately — never silence a rule in passing.',
});
`,
    });
  }
  if (has('test')) {
    files.push({
      path: 'checks/workspace/unit.check.mjs',
      body: `/**
 * \`unit\` — the test suite, run through the harness.
 *
 * Wrapped rather than reimplemented: the suite is the repository's, and the harness
 * only decides WHEN it runs and reports the verdict beside every other gate.
 */
import { commandCheck } from 'specwarden';

export const check = commandCheck({
  id: 'unit',
  title: 'unit tests pass',
  tier: 'heavy',
  cmd: '${pm} test',
  when: () => true,
  // A suite that accepts \`--shard=i/N\` can say \`shardable: true\` and the run's shard
  // is appended. Before sharding a gate that enforces something GLOBAL — a coverage
  // floor, a whole-repo audit — remember that a shard sees only its own slice.
  hint: 'A failing test is the finding. Read it before reading anything here.',
});
`,
    });
  }

  // Only over the wrappers actually written: a rule naming a check nobody wrote fails
  // `enforcement-resolves` on the tree this template just produced.
  const checkIds = [...(has('lint') ? ['lint'] : []), ...(has('test') ? ['unit'] : [])];
  const rules: IRule[] = checkIds.length
    ? [
        {
          id: 'the-suite-and-the-linter-pass',
          statement: 'Nothing merges while the linter or the test suite is red.',
          owner: '',
          enforcement: { checkIds },
        },
      ]
    : [];

  return { files, rules };
};
