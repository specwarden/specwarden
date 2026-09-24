/**
 * `changesets` — every pending changeset names a package that exists, with a bump that
 * exists, and says something to whoever installs it.
 *
 * The logic is `scripts/check-changesets.mjs`, pure and tested there. This reads the
 * folder through the file port, so the check sees what the engine sees.
 */
import { defineCheck } from 'specwarden';

import {
  CHANGESET_DIR,
  changesetProblems,
  configProblems,
  pendingChangesets,
} from '../../../scripts/check-changesets.mjs';

export const check = defineCheck({
  id: 'changesets',
  title: 'every pending changeset names a real package, and the config versions no playground',
  tier: 'fast',
  rule: {
    id: 'a-changeset-names-what-exists',
    statement:
      'a pending changeset names only published packages with a real bump and a description, and the config never versions a private package',
    owner: 'skills/publishing/SKILL.md',
  },
  when: { under: [`${CHANGESET_DIR}/`, 'scripts/registry.mjs'] },
  hint: 'Fix the frontmatter to name the package as the registry names it. Never delete a changeset to get past this — it is the only record of what the change means to a consumer.',
  // The config is always there; a run that could not read it examined nothing, and
  // "no changeset problems" over an unread folder is the green this repository exists
  // against.
  corpus: { atLeast: 1, why: `${CHANGESET_DIR}/config.json was not readable — the check compared nothing.` },
  run: (ctx) => {
    const configText = ctx.files.tryRead(`${CHANGESET_DIR}/config.json`);
    const config = configText === undefined ? undefined : JSON.parse(configText);
    const pending = pendingChangesets(ctx.files.glob(`${CHANGESET_DIR}/*.md`).map((p) => p.split('/').pop()));

    const problems = [
      ...configProblems(config),
      ...pending.flatMap((file) => changesetProblems(file, ctx.files.tryRead(`${CHANGESET_DIR}/${file}`) ?? '')),
    ];

    return {
      findings: problems.map((message) => ({ severity: 'error', file: CHANGESET_DIR, message })),
      examined: (configText === undefined ? 0 : 1) + pending.length,
      unit: 'changeset file(s)',
    };
  },
});
