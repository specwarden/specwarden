import { describe, expect, it } from 'vitest';

import { InMemoryFileSource } from 'specwarden';
import { gatesHaveCiJobs, parseWorkflowJobs } from './gates-have-ci-jobs.check';

/**
 * The cases came from the consumer-side guard this check replaced, and every one of them is
 * a shape the SCANNER got wrong at some point. Kept verbatim on the move, because a
 * rewritten test proves the rewrite and nothing else.
 *
 * The parser is line-based, so the failure modes are all "read too much" or "read too
 * little": prose that mentions a gate id, a list wrapped over two lines, the matrix
 * placeholder itself. Each of those, once, made the check report coverage it did not have.
 */
const RUNNER = String.raw`warden\.mjs\s+check`;
const WORKFLOW = '.github/workflows/ci.yml';

const GATES = [
  { id: 'be-unit', title: 'BE unit', tier: 'heavy' },
  { id: 'fe-unit', title: 'FE unit', tier: 'heavy' },
  { id: 'doc-paths', title: 'doc paths', tier: 'fast' },
];

/** A workflow whose matrix names `gates`, plus whatever extra lines a case needs. */
const workflowNaming = (gates: readonly string[], extra = ''): string => `name: ci

on:
  push:
    branches: [dev]

jobs:
  guards:
    steps:
      - run: node packages/specwarden/core/bin/warden.mjs check --tier fast

  everything:
    strategy:
      matrix:
        gate: [${gates.join(', ')}]
    steps:
      - run: node packages/specwarden/core/bin/warden.mjs check --id \${{ matrix.gate }}
${extra}
  ci-ok:
    needs: [guards, everything]
    steps:
      - run: echo done
`;

const check = gatesHaveCiJobs({
  id: 'gate-coverage',
  title: 'coverage',
  workflow: WORKFLOW,
  arbiterJob: 'ci-ok',
  ciTier: 'heavy',
  cheapTier: 'fast',
  runnerPattern: RUNNER,
  gates: () => GATES,
  when: () => true,
});

const run = (source: string) => {
  const files = new InMemoryFileSource({ [WORKFLOW]: source }, '');
  return check.run({ files } as never);
};

const messages = (verdict: { findings: readonly { message: string }[] }) =>
  verdict.findings.map((f) => f.message).join('\n');

describe('parseWorkflowJobs', () => {
  it('reads all three shapes a gate id appears in', () => {
    const jobs = parseWorkflowJobs(
      `jobs:
  a:
    strategy:
      matrix:
        gate: [one, two]
  b:
    strategy:
      matrix:
        include:
          - { gate: three, shard: 1/2 }
  c:
    steps:
      - run: warden.mjs check --id four
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
    # be-unit used to live here, and the paragraph explaining why mentions fe-unit too
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
      - run: warden.mjs check --id \${{ matrix.gate }}
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

    expect(jobs[0]?.gateIds.sort()).toEqual(['one', 'three', 'two']);
  });

  it('sees which job runs gates and which runs the cheap tier', () => {
    const jobs = parseWorkflowJobs(
      `jobs:
  a:
    steps:
      - run: node bin/warden.mjs check --tier fast
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
});

describe('gatesHaveCiJobs', () => {
  it('passes when every heavy gate is named and every gate job reaches the arbiter', () => {
    const verdict = run(workflowNaming(['be-unit', 'fe-unit']));

    expect(verdict.ok).toBe(true);
  });

  it('names the heavy gate no job runs', () => {
    const verdict = run(workflowNaming(['be-unit']));

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toContain('fe-unit');
  });

  it('names a gate id the gate list does not have', () => {
    const verdict = run(workflowNaming(['be-unit', 'fe-unit', 'be-unti']));

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toMatch(/be-unti.*not in the gate list/s);
  });

  it('refuses a fast gate named in the heavy workflow — it would run twice', () => {
    const verdict = run(workflowNaming(['be-unit', 'fe-unit', 'doc-paths']));

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toMatch(/doc-paths.*tier `fast`/s);
  });

  it('fails a gate job that is not in the arbiter needs — it can be red while the arbiter is green', () => {
    const extra = `
  extra:
    steps:
      - run: node bin/warden.mjs check --id be-unit
`;
    const verdict = run(workflowNaming(['be-unit', 'fe-unit'], extra));

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toMatch(/job `extra` runs gates but is not in `ci-ok`/);
  });

  it('fails when no job runs the cheap tier — a client-side hook can be skipped', () => {
    const verdict = run(workflowNaming(['be-unit', 'fe-unit']).replace('check --tier fast', 'check --id be-unit'));

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toContain('fast tier');
  });

  it('fails when the arbiter job is absent', () => {
    const verdict = run(workflowNaming(['be-unit', 'fe-unit']).replace('  ci-ok:', '  done:'));

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toContain('has no `ci-ok` job');
  });

  /**
   * The two ways this check can look green while knowing nothing. Both were real: a scanner
   * that stops recognising a job header, and a workflow that moved.
   */
  it('fails rather than passes when the workflow cannot be read', () => {
    const files = new InMemoryFileSource({}, '');
    const verdict = check.run({ files } as never);

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toContain('cannot be read');
  });

  it('fails rather than passes when the scan yields no jobs', () => {
    const verdict = run('name: ci\non:\n  push:\n');

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toContain('yielded no jobs');
  });

  it('fails rather than passes when no gate id is recognisable', () => {
    const verdict = run(`jobs:
  guards:
    steps:
      - run: node bin/warden.mjs check --tier fast
  ci-ok:
    needs: [guards]
    steps:
      - run: echo done
`);

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toContain('names no gate this scanner can see');
  });
});
