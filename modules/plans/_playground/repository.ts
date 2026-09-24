/**
 * ONE repository that plans its work, in two states.
 *
 * The three checks in this package read the same folder from three angles — whether a
 * plan is still live, whether it is shaped like a plan, and whether the decisions inside
 * it state why the alternatives lost. A fixture per check would let those angles drift
 * apart until the playground described a repository nobody could have.
 *
 * TWO states, because a check returning the same verdict for both cannot fail, and one
 * that cannot fail reports success. `BROKEN` carries one defect per rule.
 */

/** A plan in the shape the default convention expects. */
const plan = (body: string): string => body;

const LIVE_PLAN = plan(
  [
    '# PLAT-337 — burst allowance',
    '',
    '**Status:** active',
    '**Branch:** plat-337_burst-allowance',
    '',
    '### Decision: the limit is per tenant, never global',
    '',
    '- Rejected: one global bucket — a noisy tenant would spend every quiet tenant’s',
    '  allowance, and the one who complains is never the one who caused it.',
    '',
    '## Phase 1 — the bucket',
    '',
    'The bucket refills at a fixed rate.',
    '',
    '```bash',
    'pnpm gate --id unit',
    '```',
    '',
    '## Phase 2 — per tenant',
    '',
    '```bash',
    'pnpm gate --id typecheck',
    '```',
  ].join('\n'),
);

/** An archived plan carrying the header that makes it readable years later. */
const ARCHIVED_PLAN = [
  '# PLAT-266 — the retry budget',
  '',
  '**Started:** 2026-05-04',
  '**Finished:** 2026-06-18',
  '**Branch:** plat-266_retry-budget',
  '**Harvested:** the retry contract moved into src/RETRY_MODULE.md',
  '**Left open:** a per-tenant override for the budget',
].join('\n');

/** A repository whose plans folder satisfies all three checks. */
export const CLEAN: Record<string, string> = {
  'docs/_plans/PLAT-337-burst-allowance.md': LIVE_PLAN,
  'docs/_plans/README.md': 'The contract for this folder. See [the archive](../_archive/README.md).\n',
  'docs/_archive/PLAT-266-retry-budget.md': ARCHIVED_PLAN,
  'docs/_archive/README.md': 'What an archived plan must carry.\n',
};

/** The same repository with one defect per rule. */
export const BROKEN: Record<string, string> = {
  // plan-staleness: active, and its branch no longer resolves. The work merged and
  // nobody harvested it — so the folder now asserts a false present, in the one place
  // whose whole purpose is to be believed while the work is under way.
  // plan-shape: names a gate that is not a known check (the acceptance command exits
  // non-zero for the wrong reason, and the implementer hunts in code);
  //             sizes the work in hours (a plan states dependency and deployability);
  //             a phase with no acceptance command has no definition of done.
  // decision-log-shape: a rejection with no reason — precisely the fact that lives only
  // in the plan and is lost when it is archived without harvest.
  'docs/_plans/PLAT-337-burst-allowance.md': [
    '# PLAT-337 — burst allowance',
    '',
    '**Status:** active',
    '**Branch:** plat-337_merged-and-deleted',
    '',
    '### Decision: the limit is per tenant, never global',
    '',
    '- Rejected: one global bucket',
    '',
    '## Phase 1 — the bucket',
    '',
    'Roughly 6 hours of work.',
    '',
    '```bash',
    'pnpm gate --id no-such-gate',
    '```',
    '',
    '## Phase 2 — per tenant',
    '',
    'No command says when this is finished.',
  ].join('\n'),
  'docs/_plans/README.md': 'The contract for this folder.\n',
  // plan-staleness: an archive entry that does not say what was harvested and what was
  // left open is a slower delete — the reader cannot tell how far to trust it.
  'docs/_archive/PLAT-266-retry-budget.md': '# PLAT-266 — the retry budget\n\nDone.\n',
  'docs/_archive/README.md': 'What an archived plan must carry.\n',
};

/** The branches this checkout can resolve. The live plan's branch is here; the broken
 * one's is not, which is the whole of the staleness case. */
export const BRANCHES = ['main', 'plat-337_burst-allowance'];

/** The check ids a plan's acceptance may name — the run's own roster, in a real run. */
export const KNOWN_CHECK_IDS = ['unit', 'typecheck', 'lint'];

export const PLAN_SHAPE_CONVENTION = {
  plansDir: 'docs/_plans',
  name: /^[A-Z]+-\d+-[a-z0-9-]+\.md$/,
  sizing: [/\b\d+\s*(hours?|days?|story points?)\b/i],
  phaseHeading: /^(#{2,3})\s+Phase\b/,
  command: /^\s*(pnpm|npm|node|bash)\s/,
};

/** The factories this playground claims to exercise — the three checks and the preset. */
export const COVERED = ['planStaleness', 'planShape', 'decisionLogShape', 'plansChecks'];

/**
 * What every export is probed with to tell a factory from a helper: nothing. A factory
 * builds a check from it or refuses it by name; anything else is not a factory.
 */
export const PROBE = {};
