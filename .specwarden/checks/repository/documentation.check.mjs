/**
 * The three documentation surfaces nobody in this repository reads, and therefore the
 * three that rot: the router mirror, the shipped skills, and the scaffolded playgrounds.
 *
 * Each is written for somebody else — an agent that loads `CLAUDE.md`, an agent that
 * installed a plugin, a stranger who ran `init` once. None of them can tell us it broke.
 */
import { defineCheck, fromResult } from 'specwarden';

import { CANON, MIRROR, mirrorProblem } from '../../../scripts/router-mirror.mjs';
import { verify as verifyPlaygrounds } from '../../../scripts/playgrounds.mjs';

export const checks = [
  defineCheck({
    id: 'router-mirror',
    title: 'CLAUDE.md is AGENTS.md under another name',
    tier: 'fast',
    when: { ending: [CANON, MIRROR] },
    hint: 'Put the change in AGENTS.md, then run `pnpm check:router:write`.',
    corpus: { atLeast: 1, why: 'neither router was readable — the check compared nothing.' },
    run: (ctx) => {
      const canon = ctx.files.tryRead(CANON);
      const mirror = ctx.files.tryRead(MIRROR);
      const problem = mirrorProblem(canon, mirror);
      return {
        findings: problem ? [{ severity: 'error', file: MIRROR, message: problem }] : [],
        examined: [canon, mirror].filter((f) => f !== undefined).length,
        unit: 'router(s)',
      };
    },
  }),

  /**
   * The skills gate spawns nothing and reads a lot; the playgrounds gate scaffolds eight
   * repositories and runs the engine over each. They are wrapped through `fromResult`
   * because both scripts already return a list of human strings, which is exactly the
   * shape that adapter exists to carry — rewriting them to build findings by hand is
   * where a verdict quietly changes.
   */
  fromResult({
    id: 'skills',
    title: 'every shipped skill is listed, manifested and actually in its tarball',
    tier: 'fast',
    capabilities: ['read', 'exec'],
    when: { under: ['scripts/', 'core/skills/', 'modules/', 'plugins/', '.claude-plugin/'] },
    hint: 'Run `pnpm scaffold` for what is generated; write the SKILL.md by hand — it is a decision procedure and nothing derives one.',
    run: (ctx) => {
      const result = ctx.proc.run('node', ['scripts/check-skills.mjs'], { timeoutSec: 60 });
      if (result.status === 0) return { notes: [`${result.stdout}`.trim()] };
      return { failures: [`${result.stdout}${result.stderr}`.trim()] };
    },
  }),

  fromResult({
    id: 'playgrounds',
    title: 'every template playground carries exactly the tree init writes into it today',
    tier: 'heavy',
    capabilities: ['read', 'exec'],
    // It scaffolds into temporary directories and runs the engine inside each; two of
    // those at once is a machine doing eight installs' worth of work in parallel for no
    // reason.
    exclusive: true,
    timeoutSec: 900,
    hint: 'Change the template, then `node scripts/playgrounds.mjs --write <name>`, then review the `.specwarden/` diff. Whether that tree is green, and whether each of its checks can fail, is the template’s own playground spec — run by `unit`.',
    run: () => {
      const problems = verifyPlaygrounds();
      return problems.length
        ? { failures: problems }
        : { notes: ['every playground config is what its template writes today'] };
    },
  }),
];
