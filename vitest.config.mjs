import { defineConfig } from 'vitest/config';

/**
 * The repository's own guard scripts, and nothing else.
 *
 * They live at the root rather than in a package: they are never published, and the
 * workspace buckets hold packages only. `pnpm -r` therefore never reaches them, so the
 * `scripts-unit` gate runs this config separately.
 *
 * `include` is PINNED, and the reason is the defect this file was written to close. There
 * was no config here, so `vitest run` at the root fell back to its default glob and
 * collected every `*.spec.ts` in every package — 92 files, 892 tests, all green — while
 * not one script had a test. The gate titled "the repository's own guard scripts are
 * tested" passed on that for as long as it existed.
 */
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.mjs'],
    environment: 'node',
    // Several specs spawn the real script against a scratch tree, and a cold node start
    // on Windows under load has taken most of the default five seconds on its own.
    testTimeout: 60_000,
  },
});
