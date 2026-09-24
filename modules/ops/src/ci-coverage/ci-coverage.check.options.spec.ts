import { describe, expect, it } from 'vitest';

import { CHECK_CONTRACT_VERSION, CheckOptionsError, type ICheckMeta, errorsOf, runCheck } from 'specwarden';
import { DEFAULT_RUNNER_PATTERN, ciCoverage, parseWorkflowJobs } from './ci-coverage.check';

const WORKFLOW = '.github/workflows/ci.yml';
const ROSTER: ICheckMeta[] = [
  {
    id: 'unit',
    title: 'unit',
    tier: 'heavy',
    zone: 'consumer',
    capabilities: ['read'],
    contractVersion: CHECK_CONTRACT_VERSION,
  },
];

const workflow = (cheap: string, job = 'specwarden check --id unit'): string =>
  `jobs:\n  fast:\n    steps:\n      - run: ${cheap}\n  unit:\n    steps:\n      - run: ${job}\n  ci-ok:\n    needs: [fast, unit]\n`;

const run = (source: string, over: Record<string, unknown> = {}) =>
  runCheck(ciCoverage({ workflowFile: WORKFLOW, requiredJob: 'ci-ok', ...over }), {
    tree: { [WORKFLOW]: source },
    roster: ROSTER,
  });

describe('ciCoverage — the cheap tier is the engine’s own invocation', () => {
  it('sees `specwarden check --tier fast` under the scaffolded runner pattern — it was red', async () => {
    // The scaffolded pattern ends in `--id (\S+)`; the old test appended `--tier fast` to
    // it, which can never match, and a correct workflow failed for not running the tier.
    const verdict = await run(workflow('specwarden check --tier fast'), {
      runnerPattern: /specwarden check --id (\S+)/,
    });

    expect(errorsOf(verdict)).toEqual([]);
  });

  it('reads every spelling of the engine and of the flag', () => {
    for (const line of [
      'npx specwarden check --tier fast',
      'pnpm exec spw check --tier=fast',
      'node node_modules/specwarden/bin/specwarden.mjs check --json --tier fast',
    ]) {
      expect(parseWorkflowJobs(workflow(line))[0]?.runsCheapTier, line).toBe(true);
    }
  });

  it('still reads a host’s own runner pattern followed by the flag', () => {
    expect(parseWorkflowJobs(workflow('pnpm gate --tier fast'), /pnpm gate/, 'fast')[0]?.runsCheapTier).toBe(true);
  });

  it('reads a runner pattern written with `g` the same on every job — `.test` does not resume', () => {
    const jobs = parseWorkflowJobs(workflow('pnpm gate --tier fast', 'pnpm gate --id unit'), /pnpm gate/g, 'fast');

    expect(jobs.map((j) => j.runsChecks)).toEqual([true, true, false]);
  });

  it('does not take another tier, or a longer name, for the cheap one', () => {
    for (const line of ['specwarden check --tier heavy', 'specwarden check --tier fast-extra', 'echo --tier fast']) {
      expect(parseWorkflowJobs(workflow(line))[0]?.runsCheapTier, line).toBe(false);
    }
  });
});

describe('ciCoverage — its defaults and its options', () => {
  it('needs only the workflow file and the required job: heavy, fast and the engine’s command are the defaults', async () => {
    const check = ciCoverage({ workflowFile: WORKFLOW, requiredJob: 'ci-ok' });

    expect(check.tier).toBe('fast');
    expect(check.when(['anything'])).toBe(true);
    expect(errorsOf(await run(workflow('npx specwarden check --tier fast')))).toEqual([]);
    expect(DEFAULT_RUNNER_PATTERN.test('npx spw check --id x')).toBe(true);
  });

  it('refuses the old `workflow` and `arbiterJob` by name, and says what is required instead', () => {
    const old = { workflow: WORKFLOW, arbiterJob: 'ci-ok' } as never;

    expect(() => ciCoverage(old)).toThrow(CheckOptionsError);
    expect(() => ciCoverage(old)).toThrow(
      '`workflow` is not an option of ciCoverage; `arbiterJob` is not an option of ciCoverage; `workflowFile` is required; `requiredJob` is required',
    );
  });

  it('refuses a source string where the pattern is a RegExp, and `gates` for `checks`', () => {
    expect(() => ciCoverage({ workflowFile: WORKFLOW, requiredJob: 'ci-ok', runnerPattern: 'x' } as never)).toThrow(
      '`runnerPattern` must be a RegExp',
    );
    expect(() => ciCoverage({ workflowFile: WORKFLOW, requiredJob: 'ci-ok', gates: () => [] } as never)).toThrow(
      '`gates` is not an option of ciCoverage',
    );
  });
});

// The engine's bin is `specwarden.mjs`: the default found `warden.mjs check`, the old name,
// and read a workflow running the renamed bin as a job running no check at all.
describe('the default runner pattern', () => {
  it.each([
    ['node node_modules/specwarden/bin/specwarden.mjs check --tier fast', true],
    ['npx specwarden check --id x', true],
    ['pnpm exec spw check', true],
    ['node warden.mjs check', false],
    ['echo specwarden', false],
  ])('%s → %s', (line, found) => {
    expect(DEFAULT_RUNNER_PATTERN.test(line)).toBe(found);
  });
});

describe('parseWorkflowJobs — a matrix list with an empty entry', () => {
  it('skips the empty token a trailing comma leaves, rather than reading it as an id', () => {
    const jobs = parseWorkflowJobs('jobs:\n  a:\n    strategy:\n      matrix:\n        check: [unit, lint, ]\n');

    expect(jobs[0]?.checkIds).toEqual(['unit', 'lint']);
  });
});
