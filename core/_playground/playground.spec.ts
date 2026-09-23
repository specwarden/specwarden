import { describe, expect, it } from 'vitest';

import {
  DuplicateCheckError,
  commandCheck,
  defineCheck,
  forbidImport,
  forbidPattern,
  pathContract,
  siblingRequired,
} from 'specwarden';

import { TREE, engine } from './repository';

/**
 * The engine, exercised the way a host exercises it: a repository described, checks
 * declared through the published primitives, and a RUN — not a check body called
 * directly.
 *
 * WHY THIS IS NOT THE UNIT SUITE WITH MORE STEPS. Every unit here has its own tests, and
 * they all pass against an engine whose pieces no longer fit together: a primitive whose
 * verdict shape the runner stopped reading, a capability the context stopped gating, a
 * relevance filter that skips the tier it was meant to narrow. What a consumer installs
 * is the assembly, and this is the only place the assembly is run.
 *
 * Each case is a decision the engine makes that a consumer feels on day one, and every
 * one of them is here because getting it wrong produces a GREEN run rather than a crash.
 */

const ENV = { ci: false };

const passing = (id: string) => defineCheck({ id, title: id, run: () => [] });

describe('specwarden — the engine, assembled', () => {
  it('runs the checks it was given and exits 0 when they pass', async () => {
    const { run, results } = engine([passing('a'), passing('b')]);

    const outcome = await run({ all: true }, ENV);

    expect(outcome.exitCode).toBe(0);
    expect(results.map((r) => r.meta.id)).toEqual(['a', 'b']);
  });

  it('exits 1 when one fails, and the failing check is named in the results', async () => {
    const failing = defineCheck({
      id: 'fails',
      title: 'fails',
      run: () => [{ severity: 'error' as const, message: 'the thing is wrong' }],
    });

    const outcome = await engine([passing('a'), failing]).run({ all: true }, ENV);

    expect(outcome.exitCode).toBe(1);
    expect(outcome.results.find((r) => r.meta.id === 'fails')?.verdict.ok).toBe(false);
  });

  it('a finding is attributed to its check even when the body names no rule', async () => {
    // What links evidence back to the assertion it disproves. Left to each body it was
    // written on some findings and not others, so one run produced findings that could
    // be traced and findings that could not, for no reason a reader could see.
    const check = defineCheck({
      id: 'attributes',
      title: 'attributes',
      run: () => [{ severity: 'error' as const, message: 'x' }],
    });

    const outcome = await engine([check]).run({ all: true }, ENV);

    expect(outcome.results[0]?.verdict.findings[0]?.ruleId).toBe('attributes');
  });

  it('a corpus floor turns "matched nothing" from green into red', async () => {
    // The whole silent-success family in one declaration: a path filter that matched no
    // file examines nothing, finds nothing wrong, and reports success — for months.
    const check = defineCheck({
      id: 'reads-nothing',
      title: 'reads nothing',
      corpus: { atLeast: 1, why: 'any repository with markdown has at least one document' },
      run: (ctx) => ({ findings: [], examined: ctx.files.glob('nothing/*.md').length }),
    });

    const outcome = await engine([check]).run({ all: true, ids: ['reads-nothing'] }, ENV);

    expect(outcome.exitCode).toBe(1);
  });

  it('relevance skips a check the diff cannot have broken', async () => {
    const check = defineCheck({
      id: 'docs-only',
      title: 'docs only',
      when: { ending: ['.md'] },
      run: () => [],
    });

    const outcome = await engine([check], { changed: ['src/thing.ts'] }).run({}, ENV);
    // `skipped` carries the REASON rather than a flag, so a run can tell a check the
    // diff made irrelevant from one somebody switched off.
    expect(outcome.results[0]?.skipped).toBe('not-relevant');

    const touched = await engine([check], { changed: ['docs/GUIDE.md'] }).run({}, ENV);
    expect(touched.results[0]?.skipped).toBeFalsy();
  });

  it('an UNKNOWABLE diff runs everything rather than nothing', async () => {
    // The direction this has to fail in. Read as "nothing changed", an unreadable range
    // skips the entire tier on exactly the checkouts where the diff could not be
    // computed — a shallow clone, a first push, a detached head.
    const check = defineCheck({ id: 'narrow', title: 'narrow', when: { ending: ['.md'] }, run: () => [] });

    const outcome = await engine([check], { changed: undefined }).run({}, ENV);

    expect(outcome.results[0]?.skipped).toBeFalsy();
    expect(outcome.fullRunReason).toBeDefined();
  });

  it('a shared build input drops the relevance filter, and says why', async () => {
    const check = defineCheck({ id: 'narrow', title: 'narrow', when: { ending: ['.md'] }, run: () => [] });

    const outcome = await engine([check], { changed: ['pnpm-lock.yaml'] }).run(
      { sharedBuildInputs: [{ prefix: 'pnpm-lock.yaml', why: 'every package is rebuilt from it' }] },
      ENV,
    );

    expect(outcome.results[0]?.skipped).toBeFalsy();
    expect(outcome.fullRunReason).toContain('pnpm-lock.yaml');
  });

  it('a check may not touch a port it did not declare', async () => {
    // The gating that makes a check safe to install at all: what it may do is what it
    // said it would do, and the refusal happens where the undeclared use is.
    const sneaky = defineCheck({
      id: 'sneaky',
      title: 'sneaky',
      capabilities: ['read'],
      run: (ctx) => {
        ctx.proc.run('rm', ['-rf', '/']);
        return [];
      },
    });

    const { commands, run } = engine([sneaky]);
    const outcome = await run({ all: true }, ENV);

    expect(commands).toEqual([]);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.results[0]?.verdict.findings.map((f) => f.message).join(' ')).toContain(
      'capability it did not declare',
    );
  });

  it('a repository may deny a capability, and the check does not run at all', async () => {
    const shells = commandCheck({ id: 'suite', title: 'suite', tier: 'fast', cmd: 'node --version' });

    const { commands, run } = engine([shells]);
    const outcome = await run({ all: true, denyCapabilities: ['exec'] }, ENV);

    expect(commands).toEqual([]);
    // Denied, not skipped: a capability the repository refuses is a RED check, because
    // silently not running the suite is the outcome this product exists against.
    expect(outcome.results[0]?.verdict.ok).toBe(false);
  });

  it('two checks may not share an id — the second would be unreachable', () => {
    expect(() => engine([passing('same'), passing('same')])).toThrow(DuplicateCheckError);
  });

  it('a ratchet tolerates the debt that exists and refuses the next unit of it', async () => {
    const check = forbidPattern({
      id: 'no-todo',
      title: 'no TODO',
      tier: 'fast',
      in: 'src/**/*.ts',
      pattern: /TODO/,
      ratchetId: 'no-todo',
    });

    const tree = { ...TREE, 'src/thing.ts': '// TODO: later\nexport const thing = 1;\n' };
    const tolerated = await engine([check], { tree, ratchets: { 'no-todo': 1 } }).run({ all: true }, ENV);
    expect(tolerated.exitCode).toBe(0);

    const worse = { ...tree, 'src/index.ts': '// TODO: also later\nexport {};\n' };
    const refused = await engine([check], { tree: worse, ratchets: { 'no-todo': 1 } }).run({ all: true }, ENV);
    expect(refused.exitCode).toBe(1);
  });

  it('--tighten records what the run MEASURED, not how many lines it printed', async () => {
    // The defect this is pinned against: three checks summarised their violations into
    // one line and reported the real count on the verdict, in a field nothing read.
    // Counting printed findings instead gave zero, so a command whose whole purpose is
    // to record the truth would have recorded a fiction and failed the next ordinary run.
    // The summary is an `info` line: beside `measured`, an ERROR finding fails the verdict,
    // and `--tighten` records nothing from a failing one.
    const check = defineCheck({
      id: 'summarises',
      title: 'summarises',
      ratchetId: 'summarises',
      run: () => ({
        findings: [{ severity: 'info' as const, message: '17 violations across the tree' }],
        measured: 17,
      }),
    });

    const harness = engine([check], { ratchets: { summarises: 40 } });
    await harness.run({ all: true, tighten: true }, ENV);

    expect(harness.ratchets.values.get('summarises')).toBe(17);
  });

  it('SPECWARDEN_SKIP is honoured locally and IGNORED under CI', async () => {
    // A skip that reaches the arbiter is a hole, not a skip.
    const local = await engine([passing('a')]).run({ all: true }, { ci: false, skip: 'a' });
    expect(local.results[0]?.skipped).toBe('by-request');

    const inCi = await engine([passing('a')]).run({ all: true }, { ci: true, skip: 'a' });
    expect(inCi.results[0]?.skipped).toBeFalsy();
  });

  it('the declarative primitives produce checks the runner treats like any other', async () => {
    // A consumer's first checks are these one-liners, and they go through exactly the
    // same registration, gating, relevance and verdict path as a hand-written body.
    const checks = [
      forbidImport({ id: 'layers', title: 'layers', tier: 'fast', from: 'src/**', to: 'node:fs' }),
      pathContract({ id: 'placement', title: 'placement', tier: 'fast', kind: '**/*.md', allowedIn: ['**'] }),
    ];

    const outcome = await engine(checks).run({ all: true }, ENV);

    expect(outcome.exitCode).toBe(0);
    expect(outcome.results.map((r) => r.meta.id)).toEqual(['layers', 'placement']);
  });

  it('a command pointed at a directory that is not there is refused, and nothing is spawned', async () => {
    const harness = engine([commandCheck({ id: 'api-unit', cmd: 'pnpm test', cwd: 'packages/api' })]);
    const outcome = await harness.run({ all: true }, ENV);

    expect(outcome.exitCode).toBe(1);
    expect(outcome.results[0].verdict.findings[0].message).toContain('runs in packages/api, which is not a directory');
    expect(harness.commands).toEqual([]);
  });

  it('a sibling rule over every source file leaves the tests it names out of its subjects', async () => {
    const tree = { 'src/a.ts': '', 'src/a.test.ts': '', 'src/b.ts': '' };
    const check = siblingRequired({
      id: 'has-test',
      subjects: 'src/**/*.ts',
      require: '{name}.test.ts',
      except: ['**/*.test.ts'],
    });
    const outcome = await engine([check], { tree }).run({ all: true }, ENV);

    expect(outcome.results[0].verdict.findings.filter((f) => f.severity === 'error').map((f) => f.file)).toEqual([
      'src/b.ts',
    ]);
  });

  it('a tier is a schedule: asking for one runs only its members', async () => {
    const fast = defineCheck({ id: 'fast-one', title: 'fast', tier: 'fast', run: () => [] });
    const heavy = defineCheck({ id: 'heavy-one', title: 'heavy', tier: 'heavy', run: () => [] });

    const outcome = await engine([fast, heavy]).run({ all: true, tier: 'fast' }, ENV);

    expect(outcome.results.map((r) => r.meta.id)).toEqual(['fast-one']);
  });
});
