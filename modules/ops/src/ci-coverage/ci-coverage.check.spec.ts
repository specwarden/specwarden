import { describe, expect, it } from 'vitest';

import { CHECK_CONTRACT_VERSION, type ICheckMeta, type IVerdict, errorsOf, runCheck } from 'specwarden';
import { type ICiCoverageOptions, ciCoverage, parseWorkflowJobs } from './ci-coverage.check';

/**
 * Every case is a shape a line-based SCANNER gets wrong, and the failure modes are all
 * "read too much" or "read too little": prose that mentions a check id, a list wrapped over
 * two lines, the matrix placeholder itself. Each of those makes the check report coverage
 * it does not have.
 */
const RUNNER = /specwarden\s+check/;
const WORKFLOW = '.github/workflows/ci.yml';

const CHECKS = [
  { id: 'api-unit', title: 'API unit', tier: 'heavy' },
  { id: 'web-unit', title: 'web unit', tier: 'heavy' },
  { id: 'doc-paths', title: 'doc paths', tier: 'fast' },
];

/** A workflow whose matrix (under the `gate:` key a workflow writes) names `ids`, plus what a case needs. */
const workflowNaming = (ids: readonly string[], extra = ''): string => `name: ci

on:
  push:
    branches: [main]

jobs:
  guards:
    steps:
      - run: npx specwarden check --tier fast

  everything:
    strategy:
      matrix:
        gate: [${ids.join(', ')}]
    steps:
      - run: npx specwarden check --id \${{ matrix.gate }}
${extra}
  ci-ok:
    needs: [guards, everything]
    steps:
      - run: echo done
`;

const OPTIONS: ICiCoverageOptions = {
  title: 'coverage',
  workflowFile: WORKFLOW,
  requiredJob: 'ci-ok',
  ciTier: 'heavy',
  cheapTier: 'fast',
  runnerPattern: RUNNER,
  checks: () => CHECKS,
  when: () => true,
};

const run = (source: string, over: Partial<ICiCoverageOptions> = {}, roster?: ICheckMeta[]): Promise<IVerdict> =>
  runCheck(ciCoverage({ ...OPTIONS, ...over }), { tree: { [WORKFLOW]: source }, roster });

const messages = (verdict: IVerdict) => verdict.findings.map((f) => f.message).join('\n');

const meta = (id: string, tier: 'fast' | 'heavy'): ICheckMeta => ({
  id,
  title: id,
  tier,
  zone: 'consumer',
  capabilities: ['read'],
  contractVersion: CHECK_CONTRACT_VERSION,
});

describe('parseWorkflowJobs', () => {
  it('reads all three shapes a check id appears in', () => {
    const jobs = parseWorkflowJobs(
      `jobs:
  a:
    strategy:
      matrix:
        gate: [one, "two"]
  b:
    strategy:
      matrix:
        include:
          - { gate: three, shard: 1/2 }
  c:
    steps:
      - run: specwarden check --id four
`,
      RUNNER,
      'fast',
    );

    expect(jobs.flatMap((j) => j.checkIds).sort()).toEqual(['four', 'one', 'three', 'two']);
  });

  it('treats a check id inside a full-line comment as prose', () => {
    const jobs = parseWorkflowJobs(
      `jobs:
  a:
    # api-unit used to live here, and the paragraph explaining why mentions web-unit too
    steps:
      - run: echo hi
`,
      RUNNER,
      'fast',
    );

    expect(jobs[0]?.checkIds).toEqual([]);
  });

  it('does not mistake the matrix placeholder for a check id', () => {
    const jobs = parseWorkflowJobs(
      `jobs:
  a:
    steps:
      - run: specwarden check --id \${{ matrix.gate }}
`,
      RUNNER,
      'fast',
    );

    expect(jobs[0]?.checkIds).toEqual([]);
  });

  it('reads a list wrapped onto following lines as one list', () => {
    const jobs = parseWorkflowJobs(
      `jobs:
  a:
    strategy:
      matrix:
        gate: [one,
          two,
          three]
`,
      RUNNER,
      'fast',
    );

    expect([...(jobs[0]?.checkIds ?? [])].sort()).toEqual(['one', 'three', 'two']);
  });

  it('sees which job runs checks and which runs the cheap tier', () => {
    const jobs = parseWorkflowJobs(
      `jobs:
  a:
    steps:
      - run: npx specwarden check --tier fast
  b:
    steps:
      - run: echo nothing
`,
      RUNNER,
      'fast',
    );

    expect(jobs[0]).toMatchObject({ runsChecks: true, runsCheapTier: true });
    expect(jobs[1]).toMatchObject({ runsChecks: false, runsCheapTier: false });
  });

  it('reads `needs` as a list and as a single name', () => {
    const jobs = parseWorkflowJobs(
      `jobs:
  a:
    needs: [x, y]
  b:
    needs: x
  c:
    steps:
      - run: echo
`,
      RUNNER,
      'fast',
    );

    expect(jobs.map((j) => j.needs)).toEqual([['x', 'y'], ['x'], []]);
  });

  it('ignores what sits between `jobs:` and the first job, and reads a CRLF file', () => {
    const jobs = parseWorkflowJobs('jobs:\r\n  # the jobs\r\n\r\n  a:\r\n    needs: b\r\n', RUNNER, 'fast');

    expect(jobs).toEqual([{ id: 'a', line: 4, checkIds: [], runsChecks: false, runsCheapTier: false, needs: ['b'] }]);
  });

  it('answers no jobs for a file with no `jobs:` block', () => {
    expect(parseWorkflowJobs('name: ci\n', RUNNER, 'fast')).toEqual([]);
  });
});

describe('ciCoverage — reconciling the list against the workflow', () => {
  it('is a product-zone, read-only check', () => {
    expect(ciCoverage(OPTIONS)).toMatchObject({ zone: 'product', capabilities: ['read'], tier: 'fast' });
  });

  it('passes when every heavy check is named and every job that runs checks reaches the required job, saying what it counted', async () => {
    const verdict = await run(workflowNaming(['api-unit', 'web-unit']));

    expect(verdict).toEqual({
      ok: true,
      findings: [
        { severity: 'info', message: '✓ ci-coverage — 3 job(s) examined, clean', ruleId: 'ci-coverage' },
        { severity: 'info', message: '2 check(s) named across 3 job(s), all reaching ci-ok', ruleId: 'ci-coverage' },
      ],
      measured: 0,
    });
  });

  it('names the heavy check no job runs, with its title', async () => {
    const verdict = await run(workflowNaming(['api-unit']));

    expect(errorsOf(verdict)).toEqual([
      `heavy check \`web-unit\` (web unit) has no job in ${WORKFLOW}. Add it to the matrix of the job that offers what it needs, or move it to another tier on purpose.`,
    ]);
  });

  it('names an untitled check by its id alone', async () => {
    const verdict = await run(workflowNaming(['api-unit']), {
      checks: () => [
        { id: 'api-unit', tier: 'heavy' },
        { id: 'e2e', tier: 'heavy' },
      ],
    });

    expect(errorsOf(verdict)[0]).toMatch(/^heavy check `e2e` has no job/);
  });

  it('names a check id the run does not declare', async () => {
    const verdict = await run(workflowNaming(['api-unit', 'web-unit', 'api-unti']));

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toMatch(/api-unti.*which this run does not declare/s);
  });

  it('refuses a fast check named in the heavy workflow — it would run twice', async () => {
    const verdict = await run(workflowNaming(['api-unit', 'web-unit', 'doc-paths']));

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toMatch(/doc-paths.*tier `fast`/s);
  });

  it('reconciles against the run’s own roster when no list is given', async () => {
    // A hand-built list could forget a check, and the forgotten one would be invisible to
    // the one audit meant to notice it.
    const roster = [meta('api-unit', 'heavy'), meta('web-unit', 'heavy'), meta('e2e', 'heavy')];
    const verdict = await run(workflowNaming(['api-unit', 'web-unit']), { checks: undefined }, roster);

    expect(errorsOf(verdict)).toHaveLength(1);
    expect(errorsOf(verdict)[0]).toContain('heavy check `e2e`');
  });
});

describe('ciCoverage — the required job and the cheap tier', () => {
  it('fails a job that runs checks outside the required job’s needs — it can be red while that job is green', async () => {
    const extra = `
  extra:
    steps:
      - run: npx specwarden check --id api-unit
`;
    const verdict = await run(workflowNaming(['api-unit', 'web-unit'], extra));

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toMatch(/job `extra` runs checks but is not in `ci-ok`/);
  });

  it('fails when no job runs the cheap tier — a client-side hook can be skipped', async () => {
    const verdict = await run(
      workflowNaming(['api-unit', 'web-unit']).replace('check --tier fast', 'check --id api-unit'),
    );

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toContain('fast tier');
  });

  it('fails when the required job is absent', async () => {
    const verdict = await run(workflowNaming(['api-unit', 'web-unit']).replace('  ci-ok:', '  done:'));

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toContain('has no `ci-ok` job');
  });
});

describe('ciCoverage — what it could see', () => {
  /**
   * The ways this check can look green while knowing nothing: a workflow that moved, a
   * scanner that stopped recognising a job header, and one that stopped recognising ids.
   */
  it('fails rather than passes when the workflow cannot be read', async () => {
    const verdict = await runCheck(ciCoverage(OPTIONS), { tree: {} });

    expect(errorsOf(verdict)[0]).toMatch(
      /^examined 0 job\(s\) — `\.github\/workflows\/ci\.yml` could not be read — below the floor of 1\./,
    );
  });

  it('fails rather than passes when the scan yields no jobs', async () => {
    const verdict = await run('name: ci\non:\n  push:\n');

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toContain('yielded no job under `jobs:`');
  });

  it('fails rather than passes when no check id is recognisable', async () => {
    const verdict = await run(`jobs:
  guards:
    steps:
      - run: npx specwarden check --tier fast
  ci-ok:
    needs: [guards]
    steps:
      - run: echo done
`);

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toContain('names no check this scanner can read');
  });
});

describe('ciCoverage — the engine’s identity, ratchet and corpus', () => {
  it('is named `ci-coverage` unless it is told otherwise, and carries the rule the package implies', () => {
    const check = ciCoverage({ workflowFile: WORKFLOW, requiredJob: 'ci-ok' });

    expect(check.id).toBe('ci-coverage');
    expect(check.rule).toMatchObject({ owner: '@specwarden/ops', implied: true });
    expect(ciCoverage({ ...OPTIONS, id: 'gate-coverage' }).id).toBe('gate-coverage');
  });

  it('says where each finding is: the workflow, and the line of the job it is about', async () => {
    const extra = `
  extra:
    steps:
      - run: npx specwarden check --id api-unit
`;
    const verdict = await run(workflowNaming(['api-unit', 'web-unit'], extra));
    const outside = verdict.findings.find((f) => f.message.startsWith('job `extra`'));

    expect(outside).toMatchObject({ file: WORKFLOW, line: 19 });
  });

  it('honours `ratchet`: the debt it was armed with passes, one more fails', async () => {
    const twoMissing = workflowNaming(['api-unit']).replace('  ci-ok:', '  done:');

    expect((await run(twoMissing)).ok).toBe(false);
    expect((await run(twoMissing, { ratchet: 2 })).ok).toBe(true);
    expect((await run(twoMissing, { ratchet: 1 })).ok).toBe(false);
    // …and the stored threshold, which is what `--tighten` moves.
    const stored = await runCheck(ciCoverage({ ...OPTIONS, ratchet: 5 }), {
      tree: { [WORKFLOW]: twoMissing },
      threshold: 1,
    });
    expect(stored.ok).toBe(false);
  });

  it('`corpus: { atLeast: 0 }` accepts a workflow with no job, said in writing', async () => {
    const verdict = await run('name: ci\n', { corpus: { atLeast: 0 }, checks: () => [] });

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)[0]).toContain('has no `ci-ok` job');
  });

  it('refuses `zone`, an empty required job and a string pattern, by name', () => {
    expect(() => ciCoverage({ ...OPTIONS, zone: 'consumer' } as never)).toThrow(
      "`zone` is not an option of ciCoverage — a module's check speaks for its module",
    );
    expect(() => ciCoverage({ ...OPTIONS, requiredJob: '' })).toThrow('`requiredJob` is empty');
    expect(() => ciCoverage({ ...OPTIONS, runnerPattern: 'specwarden check' } as never)).toThrow(
      '`runnerPattern` must be a RegExp',
    );
  });
});
