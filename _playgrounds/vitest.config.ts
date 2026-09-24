import { defineConfig } from 'vitest/config';

/**
 * The workspace playground: every package this repository publishes, composed.
 *
 * `include` is pinned to this directory's own specs. `consumer/` is a consumer's
 * `.specwarden/` tree — it is copied into a scratch repository and run by the CLI, never
 * collected here.
 */
export default defineConfig({
  test: {
    include: ['*.spec.ts', 'journeys/*.spec.ts'],
    environment: 'node',
    // A scene is a laptop unless it says it is CI: the runner's own variables are removed.
    setupFiles: ['./laptop.setup.ts'],
    // The CLI scenes spawn the engine over a scratch repository: seconds, not milliseconds.
    testTimeout: 120_000,
    // A `beforeAll` runs those scenes too — `cli.spec.ts` runs two whole-workspace scenes in
    // one — and under vitest's 10s hook default it passed only while the machine was idle.
    hookTimeout: 120_000,
  },
});
