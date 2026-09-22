/**
 * What THIS repository enforces — the engine, run on itself.
 *
 * WHY THE HARNESS IS ITS OWN FIRST CONSUMER. Every argument specwarden makes is about
 * somebody else's repository: one list, a check that cannot fail is a defect, a rule
 * without an enforcer is a wish. A repository that made those arguments while keeping
 * its own guards as eleven loose scripts in a `check` chain would be making them from
 * a position it had not tested. It would also be the second consumer the README admits
 * this engine has never had — and the first real extraction is what finds the things
 * `zone-boundary` cannot.
 *
 * So the guards are CHECKS. The pure logic stays in `scripts/` where a person can run
 * it directly; `checks/` wraps each one, and the engine decides what runs, in what
 * order, at which tier, and what a verdict means.
 *
 * The consumer zone is this directory and nothing else: the checks, the rules they
 * enforce, and this file. Everything the engine knows about specwarden-the-repository
 * lives here; nothing about it lives in `core/`.
 */
import { defineConfig } from 'specwarden';

import { rules } from './rules.mjs';

export default defineConfig({
  rules,

  /**
   * Two tiers, not three.
   *
   * `fast` is everything that reads files and answers the same on any machine — it is
   * the tier a commit runs. `heavy` builds, packs and installs, which costs minutes and
   * is what a push and CI run. There is no `nightly`: the one thing slow enough to want
   * one is mutation testing, and that already has its own command in the engine's
   * package rather than a schedule nobody watches.
   */
  tiers: ['fast', 'heavy'],

  /**
   * A change to one of these makes every check relevant.
   *
   * The registry, because every generated file in the repository derives from it. The
   * lockfile and the workspace definition, because they decide what is installed and
   * therefore what every other answer was computed against. The engine's own sources,
   * because a repository whose gates run on a build of itself has no honest way to
   * filter a change to that build.
   */
  sharedBuildInputs: [
    { prefix: 'scripts/registry.mjs', why: 'every generated manifest, config and README derives from it' },
    { prefix: 'pnpm-lock.yaml', why: 'what is installed decides what every other check measured' },
    { prefix: 'pnpm-workspace.yaml', why: 'which directories are packages at all' },
    { prefix: 'core/src/', why: 'the engine running the gates is the thing that changed' },
  ],

  /**
   * The weaker sieve, behind the shared inputs: a diff too wide for any predicate to be
   * trusted. Deliberately generous — this repository's ordinary commit touches a package
   * and its test, and a change spanning forty files is a refactor whose blast radius
   * nobody has worked out.
   */
  fullRunTriggers: { files: 40, lines: 2000 },

  harness: {
    /**
     * The zone barrier, run on the engine's own sources.
     *
     * This is the only repository that hosts them, so it is the only one that can run
     * this check — and it is the check that keeps `core/` liftable. The forbidden
     * literals are the names of the repository the engine was extracted FROM: if one
     * reappears in a product source, a fact about that repository has come back into
     * the engine, and the extraction has silently started to reverse.
     */
    zone: {
      productSources: 'core/src/**/*.ts',
      except: ['core/src/**/*.spec.ts'],
      consumerImport: /\.specwarden\//,
      forbiddenLiterals: [
        {
          label: 'a host workspace of the repository this was extracted from',
          pattern: /(^|[^\w])(be|fe|landing_mkt|outreach-console)\//m,
        },
        { label: '@app/* — a shared package of that repository', pattern: /@app\// },
        { label: 'drizzle (that repository’s ORM)', pattern: /\bdrizzle\b/i },
      ],
    },
  },
});
