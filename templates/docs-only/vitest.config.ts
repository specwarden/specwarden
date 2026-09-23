import { defineConfig } from 'vitest/config';

/**
 * Two suites, one runner.
 *
 * A spec under `src/` is the UNIT suite: does this unit behave as described.
 * A spec under `_playground/` is the PLAYGROUND: does everything this package
 * PUBLISHES work, wired the way a consumer wires it, against a repository shaped like
 * theirs.
 *
 * The second is not the first with more steps. A unit suite passes over a package whose
 * factory was renamed and never re-exported, because it imports the unit by path; the
 * playground imports the PACKAGE, so it cannot.
 *
 * `include` is pinned rather than left to the default, so the runner never picks up
 * compiled tests a build emitted into `dist`.
 *
 * GENERATED from `scripts/registry.mjs`. Edit the registry.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', '_playground/**/*.spec.ts'],
    environment: 'node',
  },
});
