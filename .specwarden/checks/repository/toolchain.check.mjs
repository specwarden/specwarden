/**
 * The wrapped commands: everything whose logic is somebody else's program.
 *
 * Each one carries `refuse` or `expect` where a zero exit would not prove the command
 * did anything — which is this engine's own central claim, applied to its own gates
 * first. `pnpm -r` in particular reports an empty selection as success, so a filter that
 * matched no package and a suite that passed look identical from the exit code alone.
 */
import { commandCheck } from 'specwarden';

/** pnpm reports a filter that selected nothing as success. It is the defect this whole
 * repository exists against, in the tool it is run with. */
const NO_PACKAGE_MATCHED = [
  {
    pattern: /No projects matched the filters/i,
    why: 'the filter selected no package, and pnpm reports an empty set of work as success.',
  },
];

export const checks = [
  commandCheck({
    id: 'lockfile',
    title: 'the committed lockfile satisfies every manifest',
    tier: 'fast',
    // `--lockfile-only` touches no node_modules, so this costs a fraction of a second and
    // still catches the rename that nothing local re-read.
    cmd: 'pnpm install --frozen-lockfile --lockfile-only',
    when: { ending: ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'] },
    timeoutSec: 120,
    hint: 'Run `pnpm install` and commit the lockfile.',
  }),

  commandCheck({
    id: 'lint',
    title: 'one lint configuration, over every package',
    tier: 'fast',
    cmd: 'pnpm exec eslint . --max-warnings=0',
    timeoutSec: 300,
    hint: 'Run `pnpm lint:fix`. The engine-imports-nothing rule is the one that is not a style question.',
  }),

  commandCheck({
    id: 'format',
    title: 'formatting is decided by the formatter',
    tier: 'fast',
    cmd: 'pnpm exec prettier --check "**/*.{ts,mjs,json,md,yaml,yml}"',
    timeoutSec: 180,
    hint: 'Run `pnpm format`.',
  }),

  commandCheck({
    id: 'typecheck',
    title: 'every package typechecks in its own program',
    tier: 'fast',
    cmd: 'pnpm -r run typecheck',
    refuse: NO_PACKAGE_MATCHED,
    timeoutSec: 600,
  }),

  commandCheck({
    id: 'unit',
    title: 'every package proves its own behaviour, above its coverage ratchet',
    tier: 'heavy',
    // Sequential, and ENFORCED rather than described: `pnpm -r` runs four packages at a
    // time by default and each vitest already fans out across every core. Two heavy
    // suites at once is how a run dies with a terminated worker rather than an assertion.
    //
    // `test:coverage`, never bare `test`: a threshold that nothing turns is a number in a
    // file. Each package's generated vitest config carries its ratchet, and this is the
    // one place it is turned.
    cmd: 'pnpm -r --workspace-concurrency=1 run test:coverage',
    refuse: NO_PACKAGE_MATCHED,
    // A suite that ran nothing prints no totals. Requiring the word is what tells "all
    // green" apart from "vitest matched no test file and exited 0".
    expect: /Tests\s+\d+ passed/,
    timeoutSec: 900,
    exclusive: true,
  }),

  commandCheck({
    id: 'scripts-unit',
    title: 'the repository’s own guard scripts are tested',
    tier: 'fast',
    // They are not workspace packages, so `pnpm -r` never reaches them — which is
    // exactly how a guard ends up being the only untested code in a repository about
    // testing.
    cmd: 'pnpm exec vitest run',
    expect: /Tests\s+\d+ passed/,
    timeoutSec: 300,
  }),

  commandCheck({
    id: 'verify-build',
    title: 'the built packages pack, install and import',
    tier: 'heavy',
    cmd: 'pnpm run verify:build',
    timeoutSec: 900,
    exclusive: true,
    hint: '`dist/index.js exists` proves a file exists. This proves a consumer can use it.',
  }),

  commandCheck({
    id: 'publishable',
    title: 'every package is fit to publish',
    tier: 'fast',
    cmd: 'node scripts/check-publishable.mjs',
    when: { ending: ['package.json'], under: ['scripts/'] },
    hint: 'The undo window on npm is 72 hours and exists once per version.',
  }),
];
