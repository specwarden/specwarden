import { describe, expect, it } from 'vitest';

import type { ICheck, ICheckResult } from '../../../domain';

import { CheckRunner, RunnerUsageError } from './check-runner.service';
import { adapters, check, ratchetBacking, recordingReporter, registryOf } from './check-runner.service.spec-helpers';

describe('CheckRunner skip semantics', () => {
  it('honours SPECWARDEN_SKIP locally', async () => {
    const reg = registryOf([check({ id: 'a' }), check({ id: 'b' })]);
    const { reporter, ran } = recordingReporter();
    await new CheckRunner(reg, adapters([]), reporter).run({ tier: 'fast' }, { ci: false, skip: 'a' });
    expect(ran).toEqual(['b']);
  });

  it('IGNORES the skip under CI — a skip that reaches the arbiter is a hole', async () => {
    const reg = registryOf([check({ id: 'a' }), check({ id: 'b' })]);
    const { reporter, ran } = recordingReporter();
    await new CheckRunner(reg, adapters([]), reporter).run({ tier: 'fast' }, { ci: true, skip: 'a' });
    expect(ran).toEqual(['a', 'b']);
  });

  it('skip=all skips every candidate; an unknown skip id is a usage error', async () => {
    const reg = registryOf([check({ id: 'a' }), check({ id: 'b' })]);
    const { reporter, ran } = recordingReporter();
    await new CheckRunner(reg, adapters([]), reporter).run({ tier: 'fast' }, { ci: false, skip: 'all' });
    expect(ran).toEqual([]);
    await expect(
      new CheckRunner(reg, adapters([]), reporter).run({ tier: 'fast' }, { ci: false, skip: 'ghost' }),
    ).rejects.toThrow(RunnerUsageError);
  });
});

describe('CheckRunner denyCapabilities', () => {
  it('refuses to run a check that declares a denied capability, failing it legibly', async () => {
    let ran = false;
    const reg = registryOf([
      check({
        id: 'net-check',
        capabilities: ['net'],
        run: () => {
          ran = true;
          return { ok: true, findings: [] };
        },
      }),
    ]);
    const { exitCode, results } = await new CheckRunner(reg, adapters([]), recordingReporter().reporter).run(
      { tier: 'fast', denyCapabilities: ['net'] },
      { ci: false },
    );
    expect(ran).toBe(false);
    expect(exitCode).toBe(1);
    expect(results[0].verdict.findings[0].message).toContain('denies');
  });

  it('runs a check whose capabilities are all allowed', async () => {
    const reg = registryOf([check({ id: 'reader', capabilities: ['read'] })]);
    const { exitCode } = await new CheckRunner(reg, adapters([]), recordingReporter().reporter).run(
      { tier: 'fast', denyCapabilities: ['net', 'write'] },
      { ci: false },
    );
    expect(exitCode).toBe(0);
  });
});

describe('CheckRunner ratchets', () => {
  const ratcheted = (errors: number): ICheck => ({
    ...check({ id: 'ratcheted' }),
    ratchet: { id: 'r' },
    run: (ctx) => {
      const findings = Array.from({ length: errors }, (_, i) => ({ severity: 'error' as const, message: `e${i}` }));
      return { ok: findings.length <= (ctx.ratchet ?? 0), findings };
    },
  });

  it('the stored threshold reaches the check via ctx.ratchet, deciding ok', async () => {
    ratchetBacking.set('r', 5);
    const under = await new CheckRunner(registryOf([ratcheted(2)]), adapters([]), recordingReporter().reporter).run(
      { tier: 'fast' },
      { ci: false },
    );
    expect(under.exitCode).toBe(0); // 2 <= 5
    ratchetBacking.set('r', 1);
    const over = await new CheckRunner(registryOf([ratcheted(2)]), adapters([]), recordingReporter().reporter).run(
      { tier: 'fast' },
      { ci: false },
    );
    expect(over.exitCode).toBe(1); // 2 > 1
  });

  it('--tighten lowers the ratchet to the observed count; a normal run does not', async () => {
    ratchetBacking.set('r', 5);
    await new CheckRunner(registryOf([ratcheted(2)]), adapters([]), recordingReporter().reporter).run(
      { tier: 'fast' },
      { ci: false },
    );
    expect(ratchetBacking.get('r')).toBe(5); // unchanged without --tighten
    await new CheckRunner(registryOf([ratcheted(2)]), adapters([]), recordingReporter().reporter).run(
      { tier: 'fast', tighten: true },
      { ci: false },
    );
    expect(ratchetBacking.get('r')).toBe(2); // lowered to the observed count
  });
});

describe('CheckRunner exit code', () => {
  it('is 0 when all pass', async () => {
    const reg = registryOf([check({ id: 'a' })]);
    const { exitCode } = await new CheckRunner(reg, adapters([]), recordingReporter().reporter).run(
      { tier: 'fast' },
      { ci: false },
    );
    expect(exitCode).toBe(0);
  });

  it('is 1 when a blocking check fails', async () => {
    const reg = registryOf([check({ id: 'bad', verdict: { ok: false, findings: [] } })]);
    const { exitCode } = await new CheckRunner(reg, adapters([]), recordingReporter().reporter).run(
      { tier: 'fast' },
      { ci: false },
    );
    expect(exitCode).toBe(1);
  });

  it('stays 0 when only an advisory check fails', async () => {
    const reg = registryOf([check({ id: 'adv', advisory: true, verdict: { ok: false, findings: [] } })]);
    const { exitCode } = await new CheckRunner(reg, adapters([]), recordingReporter().reporter).run(
      { tier: 'fast' },
      { ci: false },
    );
    expect(exitCode).toBe(0);
  });

  it('a thrown check becomes a failing verdict, not a crashed run', async () => {
    const reg = registryOf([
      check({
        id: 'boom',
        run: () => {
          throw new Error('kaboom');
        },
      }),
      check({ id: 'after' }),
    ]);
    const { reporter, ran } = recordingReporter();
    const { exitCode, results } = await new CheckRunner(reg, adapters([]), reporter).run(
      { tier: 'fast' },
      { ci: false },
    );
    expect(exitCode).toBe(1);
    expect(ran).toEqual(['boom', 'after']); // the run continued past the throw
    expect(results.find((r) => r.meta.id === 'boom')?.verdict.findings[0]?.message).toContain('kaboom');
  });
});

/**
 * What a run RECORDS, and what it attributes.
 *
 * The first of these is a defect that was live: three checks summarised their
 * violations into one info line and stated the real number on the verdict, in a field
 * nothing read. Counting error findings gave zero on every passing run, so `--tighten`
 * would have rewritten thresholds of 17 and 37 down to 0 and failed the very next
 * ordinary run.
 */
describe('CheckRunner ratchet measurement', () => {
  const summarising = (measured: number): ICheck => ({
    ...check({ id: 'summarising' }),
    ratchet: { id: 'm' },
    // One info line, the count stated rather than shown — the shape a check takes when
    // printing one finding per violation would bury the report.
    run: (ctx) => ({
      ok: measured <= (ctx.ratchet ?? 0),
      findings: [{ severity: 'info' as const, message: `${measured} without a claim` }],
      ratchet: { value: measured },
    }),
  });

  it('--tighten records the number the verdict STATES, not the findings it printed', async () => {
    ratchetBacking.set('m', 17);
    await new CheckRunner(registryOf([summarising(17)]), adapters([]), recordingReporter().reporter).run(
      { tier: 'fast', tighten: true },
      { ci: false },
    );
    expect(ratchetBacking.get('m')).toBe(17);
  });

  it('and it still tightens when the debt was really paid down', async () => {
    ratchetBacking.set('m', 17);
    await new CheckRunner(registryOf([summarising(4)]), adapters([]), recordingReporter().reporter).run(
      { tier: 'fast', tighten: true },
      { ci: false },
    );
    expect(ratchetBacking.get('m')).toBe(4);
  });

  it('a floor is tightened UPWARDS — the debt rule would erase it', async () => {
    const scored = (score: number): ICheck => ({
      ...check({ id: 'scored' }),
      ratchet: { id: 'f', direction: 'up' },
      run: () => ({ ok: true, findings: [], ratchet: { value: score } }),
    });

    ratchetBacking.set('f', 68);
    await new CheckRunner(registryOf([scored(71)]), adapters([]), recordingReporter().reporter).run(
      { tier: 'fast', tighten: true },
      { ci: false },
    );
    expect(ratchetBacking.get('f')).toBe(71);

    await new CheckRunner(registryOf([scored(61)]), adapters([]), recordingReporter().reporter).run(
      { tier: 'fast', tighten: true },
      { ci: false },
    );
    expect(ratchetBacking.get('f')).toBe(71); // a drop is discarded, not recorded
  });
});

describe('CheckRunner finding attribution', () => {
  it('stamps every finding with the check id, so nothing is untraceable', async () => {
    const reg = registryOf([
      check({ id: 'a', verdict: { ok: false, findings: [{ severity: 'error', message: 'bad' }] } }),
    ]);
    const { results } = await new CheckRunner(reg, adapters([]), recordingReporter().reporter).run(
      { tier: 'fast' },
      { ci: false },
    );

    expect(results[0].verdict.findings[0].ruleId).toBe('a');
  });

  it('leaves a finding that already names its rule alone', async () => {
    const reg = registryOf([
      check({ id: 'a', verdict: { ok: false, findings: [{ severity: 'error', message: 'bad', ruleId: 'the-rule' }] } }),
    ]);
    const { results } = await new CheckRunner(reg, adapters([]), recordingReporter().reporter).run(
      { tier: 'fast' },
      { ci: false },
    );

    expect(results[0].verdict.findings[0].ruleId).toBe('the-rule');
  });

  it('attributes the finding a thrown check becomes', async () => {
    const reg = registryOf([
      check({
        id: 'boom',
        run: () => {
          throw new Error('kaboom');
        },
      }),
    ]);
    const { results } = await new CheckRunner(reg, adapters([]), recordingReporter().reporter).run(
      { tier: 'fast' },
      { ci: false },
    );

    expect(results[0].verdict.findings[0].ruleId).toBe('boom');
  });
});

/**
 * A run that hangs is the worst diagnostic there is: in CI it burns the whole job
 * budget and reports nothing about which check stalled.
 */
describe('CheckRunner deadlines', () => {
  const stalling = (timeoutSec?: number): ICheck => ({
    ...check({ id: 'stalls' }),
    timeoutSec,
    run: () => new Promise(() => {}), // never settles
  });

  it('fails a check that outlives its declared deadline, and names it', async () => {
    const { results } = await new CheckRunner(
      registryOf([stalling(0.01)]),
      adapters([]),
      recordingReporter().reporter,
    ).run({ tier: 'fast' }, { ci: false });

    expect(results[0].verdict.ok).toBe(false);
    expect(results[0].verdict.findings[0].message).toContain('stalls exceeded its 0.01s deadline');
  });

  it('a timed-out check FAILS rather than being skipped — the two are opposite claims', async () => {
    const { exitCode, results } = await new CheckRunner(
      registryOf([stalling(0.01)]),
      adapters([]),
      recordingReporter().reporter,
    ).run({ tier: 'fast' }, { ci: false });

    expect(exitCode).toBe(1);
    expect(results[0].skipped).toBeUndefined();
  });

  it('the run continues past a stalled check', async () => {
    const reg = registryOf([stalling(0.01), check({ id: 'after' })]);
    const { results } = await new CheckRunner(reg, adapters([]), recordingReporter().reporter).run(
      { tier: 'fast' },
      { ci: false },
    );

    expect(results.map((r) => r.meta.id)).toEqual(['stalls', 'after']);
    expect(results[1].verdict.ok).toBe(true);
  });

  it('a check that declares no deadline is left alone', async () => {
    const quick = { ...check({ id: 'quick' }), run: async () => ({ ok: true, findings: [] }) };
    const { exitCode } = await new CheckRunner(registryOf([quick]), adapters([]), recordingReporter().reporter).run(
      { tier: 'fast' },
      { ci: false },
    );

    expect(exitCode).toBe(0);
  });

  it('a check that finishes inside its deadline is not penalised for having one', async () => {
    const quick = { ...check({ id: 'quick' }), timeoutSec: 30, run: async () => ({ ok: true, findings: [] }) };
    const { exitCode } = await new CheckRunner(registryOf([quick]), adapters([]), recordingReporter().reporter).run(
      { tier: 'fast' },
      { ci: false },
    );

    expect(exitCode).toBe(0);
  });
});

describe('CheckRunner skip reporting', () => {
  /** A reporter that records every result it is handed, skips included. */
  const recording = () => {
    const seen: { id: string; skipped?: string }[] = [];
    return {
      seen,
      reporter: {
        checkStarted: () => {},
        checkFinished: (r: ICheckResult) => void seen.push({ id: r.meta.id, skipped: r.skipped }),
        runFinished: () => {},
      },
    };
  };

  it('hands a not-relevant skip to the reporter instead of swallowing it', async () => {
    // It was pushed to the results and never reported, which made the reporter's own
    // skip branch unreachable: a run printed a count and no way to learn WHICH.
    const reg = registryOf([check({ id: 'a', when: () => false }), check({ id: 'b' })]);
    const rec = recording();
    await new CheckRunner(reg, adapters(['x.ts']), rec.reporter).run({ tier: 'fast' }, { ci: false });

    expect(rec.seen).toEqual([
      { id: 'a', skipped: 'not-relevant' },
      { id: 'b', skipped: undefined },
    ]);
  });

  it('hands a by-request skip over too', async () => {
    const reg = registryOf([check({ id: 'a' })]);
    const rec = recording();
    await new CheckRunner(reg, adapters([]), rec.reporter).run({ tier: 'fast' }, { ci: false, skip: 'a' });

    expect(rec.seen).toEqual([{ id: 'a', skipped: 'by-request' }]);
  });

  it('reports skips in registry order under concurrency, same as serially', async () => {
    const reg = registryOf([
      check({ id: 'a', when: () => false }),
      check({ id: 'b' }),
      check({ id: 'c', when: () => false }),
    ]);
    const rec = recording();
    await new CheckRunner(reg, adapters(['x.ts']), rec.reporter).run({ tier: 'fast', concurrency: 4 }, { ci: false });

    expect(rec.seen.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});
