// Mutation testing — the one MECHANICAL answer to the fear the whole product is
// built around: "a check that cannot fail reports success." A unit test proves a
// check passes on good input; a mutant proves its test would NOTICE a break. Stryker
// inverts a condition, shifts a boundary, deletes a call, and asks whether the tests
// go red. A surviving mutant is literally "here is a way to break this check that no
// test catches."
//
// SCOPE — only the built-in PRODUCT-zone checks and the primitives they are built
// from, not all sixty. The reason is not economy: a P-zone check's behaviour is
// public API, so the cost of an unnoticed break is higher there than in a check that
// lives in one repository. The bridged/consumer checks are out of scope on purpose.
//
// The score gets its own ratchet (.specwarden/../ratchets/mutation-score.json in a
// consumer; here we keep the threshold in this config): it only ever rises, and it
// is set to the ACTUAL first-run value, never 100% — a surviving mutant is sometimes
// an equivalent mutation that changes no behaviour, and those are triaged one by one
// rather than chased to a round number. Tier nightly: the run is slow by nature.
export default {
  testRunner: 'vitest',
  // Explicit under pnpm's isolated node_modules — auto-discovery of
  // `@stryker-mutator/*` plugins does not resolve the symlinked runner otherwise.
  plugins: ['@stryker-mutator/vitest-runner'],
  // vitest-runner does not support per-test coverage analysis; 'off' runs the full
  // suite per mutant — correct, just slower, which is why this is a nightly gate.
  coverageAnalysis: 'off',
  // RECURSIVE, and that is the whole of a defect this config carried silently. The globs were
  // 'src/checks/*.ts' and 'src/primitives/*.ts' — one level deep — against a tree that is
  // folder-per-unit: every check lives at 'src/checks/<id>/<id>.check.ts'. They matched NOTHING
  // but the two barrels, which are excluded, so stryker instrumented zero files and died with
  // "No tests were executed" — a configuration error wearing the face of a test failure, in the
  // one check whose whole job is to prove a check would notice being broken.
  mutate: [
    'src/checks/**/*.ts',
    'src/primitives/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/checks/index.ts',
    '!src/primitives/index.ts',
    '!src/primitives/_shared/**',
  ],
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  // The floor, and it is a RATCHET: `break` is set at or just below the measured
  // score (76.43% → 76, floored), never 100% — a surviving mutant is sometimes an
  // equivalent mutation that changes no behaviour. It only ever rises, as survivors
  // are triaged and killed. Mirrored in the consumer's mutation-score ratchet for the
  // record; this `break` is what stryker enforces.
  //
  // Raised from 68 on 2026-09-22, and the reason is worth keeping: the score did not
  // move because survivors were triaged, but because new behaviour arrived WITH tests
  // that kill its mutants. A floor left at the old number would have kept tolerating an
  // eight-point regression in code that no longer has that debt.
  thresholds: { high: 85, low: 70, break: 76 },
  concurrency: 2,
  timeoutMS: 20000,
};
