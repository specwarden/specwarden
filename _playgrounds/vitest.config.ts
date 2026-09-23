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
    // The CLI scenes spawn the engine over a scratch repository: seconds, not milliseconds.
    testTimeout: 120_000,
  },
});
