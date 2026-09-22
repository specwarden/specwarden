import { defineConfig } from 'vitest/config';

/**
 * `include` is pinned to `src/` so the runner never sees compiled tests emitted
 * into `dist/` by a build (same reasoning as packages/contracts). `.spec.ts` is
 * the house suffix — the tester lives beside the unit it tests.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});
