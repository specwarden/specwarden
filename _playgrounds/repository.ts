/**
 * ONE repository, checked by EVERY package this workspace publishes at once.
 *
 * WHAT THIS ADDS TO THE PER-PACKAGE PLAYGROUNDS. Each package's `_playground/` proves
 * that package works. None of them can prove the packages work TOGETHER, and that is a
 * different question with its own failures: two modules minting the same check id, a
 * module whose options collide with another's under one config, a plugin whose checks
 * never reach the registry, a tier split that leaves a gate in no tier at all. Every one
 * of those is invisible to a per-package suite and immediate for a consumer, who installs
 * four of these packages on day one and writes exactly one config.
 *
 * So: one repository, described once, carrying a subject for every module — documents, a
 * plan, an ops surface, an agent roster, a NestJS module, a credential.
 */

/** A repository that satisfies every check in the assembled config. */
export const CLEAN: Record<string, string> = {
  // @specwarden/docs — a backticked path that resolves, a symbol that is declared, a
  // relative link that lands.
  'README.md': [
    '# a repository',
    '',
    'The entry point is `src/index.ts`, and `ServiceRegistry` is what it exports.',
    '',
    'See [the module document](./src/THINGS_MODULE.md).',
  ].join('\n'),
  'src/index.ts': "export class ServiceRegistry {}\nexport { GapService } from './modules/gaps/gaps.service';\n",
  'src/THINGS_MODULE.md': '# things\n\nThe invariants of this module.\n',

  // @specwarden/plans — an active plan naming a branch that resolves, and a decision
  // whose rejected alternative states why it lost.
  'docs/_plans/refunds.md': [
    '# Partial refunds',
    '',
    '**Status:** active',
    '**Branch:** feat/partial-refunds',
    '',
    '### Decision: a refund is taken per line',
    '',
    '- Rejected: a free-text amount — a typed number reconciles against nothing.',
    '',
    '## Phase 1 — the refund line',
    '',
    '```bash',
    'pnpm gate --id unit',
    '```',
  ].join('\n'),
  'docs/_plans/README.md': 'The contract for this folder.\n',

  // @specwarden/ops — a shell script whose `local` is inside a function.
  'scripts/deploy.sh':
    '#!/usr/bin/env bash\nset -Eeuo pipefail\n\nmain() {\n  local target\n  target="$1"\n}\n\nmain "$@"\n',

  // @specwarden/agents — a roster where only the orchestrator may spawn.
  '.claude/agents/lead.md': '---\nname: lead\ndescription: Plans.\ntools: Read, Agent\nmodel: opus\n---\n\nPlans.\n',
  '.claude/agents/reviewer.md':
    '---\nname: reviewer\ndescription: Reviews.\ntools: Read, Grep\nmodel: sonnet\n---\n\nReviews.\n',

  // @specwarden/plugin-nestjs — the query lives behind a repository.
  'src/modules/gaps/gaps.service.ts': "import { GapRepository } from './repositories/gap.repository';\n",
  'src/modules/gaps/repositories/gap.repository.ts': "import { eq } from 'drizzle-orm';\n",

  // @specwarden/security — configuration read from the environment, never committed.
  '.env.example': 'API_TOKEN=\n',
};

/**
 * The same repository with one defect per PACKAGE.
 *
 * Not per check: the per-package playgrounds already hold every check to its own
 * failure. What this tree has to prove is that under one assembled config each package
 * still reaches its own subject — so one defect each, and the assertion is that every
 * one of them is reported.
 */
export const BROKEN: Record<string, string> = {
  ...CLEAN,
  // docs: a backticked path that resolves to nothing.
  'README.md': '# a repository\n\nThe entry point is `src/gone.ts`.\n',
  // plans: a rejection with no reason — the fact that is lost when a plan is archived
  // without harvest.
  'docs/_plans/refunds.md': [
    '# Partial refunds',
    '',
    '**Status:** active',
    '**Branch:** feat/partial-refunds',
    '',
    '### Decision: a refund is taken per line',
    '',
    '- Rejected: a free-text amount',
    '',
    '## Phase 1 — the refund line',
    '',
    '```bash',
    'pnpm gate --id unit',
    '```',
  ].join('\n'),
  // ops: `local` in the main block, which is not a function. Bash refuses it at run
  // time, in the deploy script, on the deploy.
  'scripts/deploy.sh': '#!/usr/bin/env bash\nset -Eeuo pipefail\n\nlocal target\ntarget="$1"\n',
  // agents: a leaf role that can spawn.
  '.claude/agents/reviewer.md':
    '---\nname: reviewer\ndescription: Reviews.\ntools: Read, Agent\nmodel: sonnet\n---\n\nReviews.\n',
  // nestjs: the service reaches the ORM directly.
  'src/modules/gaps/gaps.service.ts': "import { eq } from 'drizzle-orm';\n",
  // security: a credential in the tree. Assembled rather than written out, so this
  // fixture does not trip a scan run over THIS repository.
  'src/config.ts': `export const key = '${`AKIA${'ABCDEFGHIJ012345'}`}';\n`,
};

/** The branches this checkout resolves — the plan's branch is one of them. */
export const BRANCHES = ['main', 'feat/partial-refunds'];

/**
 * Every check id the consumer config declares — the in-process spec's `defineConfig` and
 * the files under `consumer/` both. ONE list, asserted by both specs, so the two ways of
 * composing the packages cannot quietly start describing different configs.
 */
export const EVERY_CHECK_ID = [
  'agent-definitions',
  'decision-log-shape',
  'doc-hygiene',
  'doc-paths',
  'doc-symbols',
  'nestjs/db-access-through-repositories',
  'plan-staleness',
  'secret-scan',
  'shell-local-scope',
] as const;

/** What `BROKEN` turns red — one check per package, and nothing else. */
export const CAUGHT_IN_BROKEN = [
  'agent-definitions',
  'decision-log-shape',
  'doc-paths',
  'nestjs/db-access-through-repositories',
  'secret-scan',
  'shell-local-scope',
] as const;
