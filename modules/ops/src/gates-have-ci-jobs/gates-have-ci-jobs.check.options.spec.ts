import { describe, expect, it } from 'vitest';

import { CHECK_CONTRACT_VERSION, CheckOptionsError, type ICheckMeta, errorsOf, runCheck } from 'specwarden';
import { DEFAULT_RUNNER_PATTERN, gatesHaveCiJobs, parseWorkflowJobs } from './gates-have-ci-jobs.check';

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

const workflow = (cheap: string, gate = 'specwarden check --id unit'): string =>
  `jobs:\n  fast:\n    steps:\n      - run: ${cheap}\n  unit:\n    steps:\n      - run: ${gate}\n  ci-ok:\n    needs: [fast, unit]\n`;

const run = (source: string, over: Record<string, unknown> = {}) =>
  runCheck(gatesHaveCiJobs({ id: 'gate-coverage', title: 't', workflow: WORKFLOW, arbiterJob: 'ci-ok', ...over }), {
    tree: { [WORKFLOW]: source },
    roster: ROSTER,
  });

describe('gatesHaveCiJobs — the cheap tier is the engine’s own invocation', () => {
  it('sees `specwarden check --tier fast` under the scaffolded runner pattern — it was red', async () => {
    // The scaffolded pattern ends in `--id (\S+)`; the old test appended `--tier fast` to
    // it, which can never match, and a correct workflow failed for not running the tier.
    const verdict = await run(workflow('specwarden check --tier fast'), {
      runnerPattern: String.raw`specwarden check --id (\S+)`,
    });

    expect(errorsOf(verdict)).toEqual([]);
  });

  it('reads every spelling of the engine and of the flag', () => {
    for (const line of [
      'npx specwarden check --tier fast',
      'pnpm exec spw check --tier=fast',
      'node node_modules/specwarden/bin/warden.mjs check --json --tier fast',
    ]) {
      expect(parseWorkflowJobs(workflow(line))[0]?.runsCheapTier, line).toBe(true);
    }
  });

  it('still reads a host’s own runner pattern followed by the flag', () => {
    expect(parseWorkflowJobs(workflow('pnpm gate --tier fast'), 'pnpm gate', 'fast')[0]?.runsCheapTier).toBe(true);
  });

  it('does not take another tier, or a longer name, for the cheap one', () => {
    for (const line of ['specwarden check --tier heavy', 'specwarden check --tier fast-extra', 'echo --tier fast']) {
      expect(parseWorkflowJobs(workflow(line))[0]?.runsCheapTier, line).toBe(false);
    }
  });
});

describe('gatesHaveCiJobs — its defaults and its options', () => {
  it('needs only the workflow and the arbiter: heavy, fast and the engine’s command are the defaults', async () => {
    const check = gatesHaveCiJobs({ id: 'gate-coverage', title: 't', workflow: WORKFLOW, arbiterJob: 'ci-ok' });

    expect(check.tier).toBe('fast');
    expect(check.when(['anything'])).toBe(true);
    expect(errorsOf(await run(workflow('npx specwarden check --tier fast')))).toEqual([]);
    expect(new RegExp(DEFAULT_RUNNER_PATTERN).test('npx spw check --id x')).toBe(true);
  });

  it('refuses the skill’s `arbiter:` by name, and says the required `arbiterJob` is missing', () => {
    const skill = { id: 'gate-coverage', title: 't', workflow: WORKFLOW, arbiter: 'ci-ok' } as never;

    expect(() => gatesHaveCiJobs(skill)).toThrow(CheckOptionsError);
    expect(() => gatesHaveCiJobs(skill)).toThrow(
      '`arbiter` is not an option of gatesHaveCiJobs; `arbiterJob` is required',
    );
  });

  it('refuses a RegExp where the pattern is a source string', () => {
    expect(() =>
      gatesHaveCiJobs({ id: 'g', title: 't', workflow: WORKFLOW, arbiterJob: 'ci-ok', runnerPattern: /x/ } as never),
    ).toThrow('`runnerPattern` must be a string');
  });
});
