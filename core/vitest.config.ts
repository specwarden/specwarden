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
 * COVERAGE IS A RATCHET, not a target: add the missing test, never lower a threshold.
 * Each number is the measurement minus one point, floored. Two runs of an unchanged
 * suite differ in the hundredths on the async paths, and a threshold nailed to the best
 * observation fails on a coin toss — a check that cries wolf stops being read.
 *
 * Measured 2026-09-23.
 *
 * GENERATED from `scripts/registry.mjs`. Edit the registry.
 */
export default defineConfig({
  test: {
    // `_playground/*.spec.ts` and not `**`: a template's playground holds a stranger's
    // repository, and nothing in it is this package's test.
    include: ['src/**/*.spec.ts', '_playground/*.spec.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // A spec and its helpers are the instrument, not the subject: counted, they
      // report themselves as covered and lift the number that gates real code.
      exclude: ['src/**/*.spec.ts', 'src/**/*.spec-helpers.ts'],
      reporter: ['text-summary', 'json-summary'],
      thresholds: { statements: 99, branches: 97, functions: 98, lines: 99 },
    },
  },
});
