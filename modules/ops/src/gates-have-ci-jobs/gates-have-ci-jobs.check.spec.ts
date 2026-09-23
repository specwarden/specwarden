import { describe, expect, it } from 'vitest';

import { CHECK_CONTRACT_VERSION, type ICheckMeta, type IVerdict, errorsOf, runCheck } from 'specwarden';
import { type IGatesHaveCiJobsOptions, gatesHaveCiJobs, parseWorkflowJobs } from './gates-have-ci-jobs.check';

/**
 * Every case is a shape a line-based SCANNER gets wrong, and the failure modes are all
 * "read too much" or "read too little": prose that mentions a gate id, a list wrapped over
 * two lines, the matrix placeholder itself. Each of those makes the check report coverage
 * it does not have.
 */
const RUNNER = String.raw`specwarden\s+check`;
const WORKFLOW = '.github/workflows/ci.yml';

const GATES = [
  { id: 'api-unit', title: 'API unit', tier: 'heavy' },
  { id: 'web-unit', title: 'web unit', tier: 'heavy' },
  { id: 'doc-paths', title: 'doc paths', tier: 'fast' },
];

/** A workflow whose matrix names `gates`, plus whatever extra lines a case needs. */
const workflowNaming = (gates: readonly string[], extra = ''): string => `name: ci

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
        gate: [${gates.join(', ')}]
    steps:
      - run: npx specwarden check --id \${{ matrix.gate }}
${extra}
  ci-ok:
    needs: [guards, everything]
    steps:
      - run: echo done
`;

const OPTIONS: IGatesHaveCiJobsOptions = {
  id: 'gate-coverage',
  title: 'coverage',
  workflow: WORKFLOW,
  arbiterJob: 'ci-ok',
  ciTier: 'heavy',
  cheapTier: 'fast',
  runnerPattern: RUNNER,
  gates: () => GATES,
  when: () => true,
};

const run = (source: string, over: Partial<IGatesHaveCiJobsOptions> = {}, roster?: ICheckMeta[]): Promise<IVerdict> =>
  runCheck(gatesHaveCiJobs({ ...OPTIONS, ...over }), { tree: { [WORKFLOW]: source }, roster });

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
  it('reads all three shapes a gate id appears in', () => {
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

    expect(jobs.flatMap((j) => j.gateIds).sort()).toEqual(['four', 'one', 'three', 'two']);
  });

  it('treats a gate id inside a full-line comment as prose', () => {
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

    expect(jobs[0]?.gateIds).toEqual([]);
  });

  it('does not mistake the matrix placeholder for a gate id', () => {
    const jobs = parseWorkflowJobs(
      `jobs:
  a:
    steps:
      - run: specwarden check --id \${{ matrix.gate }}
`,
      RUNNER,
      'fast',
    );

    expect(jobs[0]?.gateIds).toEqual([]);
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

    expect([...(jobs[0]?.gateIds ?? [])].sort()).toEqual(['one', 'three', 'two']);
  });

  it('sees which job runs gates and which runs the cheap tier', () => {
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

    expect(jobs[0]).toMatchObject({ runsGates: true, runsCheapTier: true });
    expect(jobs[1]).toMatchObject({ runsGates: false, runsCheapTier: false });
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

    expect(jobs).toEqual([{ id: 'a', gateIds: [], runsGates: false, runsCheapTier: false, needs: ['b'] }]);
  });

  it('answers no jobs for a file with no `jobs:` block', () => {
    expect(parseWorkflowJobs('name: ci\n', RUNNER, 'fast')).toEqual([]);
  });
});

describe('gatesHaveCiJobs — reconciling the list against the workflow', () => {
  it('is a product-zone, read-only check', () => {
    expect(gatesHaveCiJobs(OPTIONS)).toMatchObject({ zone: 'product', capabilities: ['read'], tier: 'fast' });
  });

  it('passes when every heavy gate is named and every gate job reaches the arbiter, saying what it counted', async () => {
    const verdict = await run(workflowNaming(['api-unit', 'web-unit']));

    expect(verdict).toEqual({
      ok: true,
      findings: [{ severity: 'info', message: '✓ 2 gate(s) named across 3 job(s), all reaching ci-ok' }],
    });
  });

  it('names the heavy gate no job runs, with its title', async () => {
    const verdict = await run(workflowNaming(['api-unit']));

    expect(errorsOf(verdict)).toEqual([
      `heavy gate \`web-unit\` (web unit) has no job in ${WORKFLOW}. Add it to the matrix of the job that offers what it needs, or move it to another tier on purpose.`,
    ]);
  });

  it('names an untitled gate by its id alone', async () => {
    const verdict = await run(workflowNaming(['api-unit']), {
      gates: () => [
        { id: 'api-unit', tier: 'heavy' },
        { id: 'e2e', tier: 'heavy' },
      ],
    });

    expect(errorsOf(verdict)[0]).toMatch(/^heavy gate `e2e` has no job/);
  });

  it('names a gate id the gate list does not have', async () => {
    const verdict = await run(workflowNaming(['api-unit', 'web-unit', 'api-unti']));

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toMatch(/api-unti.*not in the gate list/s);
  });

  it('refuses a fast gate named in the heavy workflow — it would run twice', async () => {
    const verdict = await run(workflowNaming(['api-unit', 'web-unit', 'doc-paths']));

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toMatch(/doc-paths.*tier `fast`/s);
  });

  it('reconciles against the run’s own roster when no list is given', async () => {
    // A hand-built list could forget a check, and the forgotten one would be invisible to
    // the one audit meant to notice it.
    const roster = [meta('api-unit', 'heavy'), meta('web-unit', 'heavy'), meta('e2e', 'heavy')];
    const verdict = await run(workflowNaming(['api-unit', 'web-unit']), { gates: undefined }, roster);

    expect(errorsOf(verdict)).toHaveLength(1);
    expect(errorsOf(verdict)[0]).toContain('heavy gate `e2e`');
  });
});

describe('gatesHaveCiJobs — the arbiter and the cheap tier', () => {
  it('fails a gate job that is not in the arbiter needs — it can be red while the arbiter is green', async () => {
    const extra = `
  extra:
    steps:
      - run: npx specwarden check --id api-unit
`;
    const verdict = await run(workflowNaming(['api-unit', 'web-unit'], extra));

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toMatch(/job `extra` runs gates but is not in `ci-ok`/);
  });

  it('fails when no job runs the cheap tier — a client-side hook can be skipped', async () => {
    const verdict = await run(
      workflowNaming(['api-unit', 'web-unit']).replace('check --tier fast', 'check --id api-unit'),
    );

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toContain('fast tier');
  });

  it('fails when the arbiter job is absent', async () => {
    const verdict = await run(workflowNaming(['api-unit', 'web-unit']).replace('  ci-ok:', '  done:'));

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toContain('has no `ci-ok` job');
  });
});

describe('gatesHaveCiJobs — what it could see', () => {
  /**
   * The ways this check can look green while knowing nothing: a workflow that moved, a
   * scanner that stopped recognising a job header, and one that stopped recognising ids.
   */
  it('fails rather than passes when the workflow cannot be read', async () => {
    const verdict = await runCheck(gatesHaveCiJobs(OPTIONS), { tree: {} });

    expect(errorsOf(verdict)).toEqual([`${WORKFLOW} cannot be read — a check that sees nothing passes everything.`]);
  });

  it('fails rather than passes when the scan yields no jobs', async () => {
    const verdict = await run('name: ci\non:\n  push:\n');

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toContain('yielded no jobs');
  });

  it('fails rather than passes when no gate id is recognisable', async () => {
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
    expect(messages(verdict)).toContain('names no gate this scanner can see');
  });
});
