import { describe, expect, it } from 'vitest';

import { CheckRunner } from './check-runner.service';
import { adapters, check, recordingReporter, rosterOf } from './check-runner.service.spec-helpers';

describe('CheckRunner --fix', () => {
  it('repairs a fixable check, re-runs it, and reports what was fixed', async () => {
    let broken = true;
    const fixme: ICheck & IFixable = {
      ...check({ id: 'fixme', capabilities: ['write'] }),
      run: () =>
        broken ? { ok: false, findings: [{ severity: 'error', message: 'broken' }] } : { ok: true, findings: [] },
      fix: (ctx: ICheckContext) => {
        ctx.writer.write('out.txt', 'repaired');
        broken = false;
        return { fixed: 1, summary: 'rewrote out.txt' };
      },
    };
    const { exitCode, results } = await new CheckRunner(
      rosterOf([fixme]),
      adapters([]),
      recordingReporter().reporter,
    ).run({ tier: 'fast', fix: true }, { ci: false });
    expect(exitCode).toBe(0);
    expect(results[0].verdict.findings[0].message).toContain('fixed 1 finding(s): rewrote out.txt');
  });

  it('a fixable check without the write capability fails the fix legibly (its writer refuses)', async () => {
    const fixme: ICheck & IFixable = {
      ...check({ id: 'nowrite', capabilities: [] }),
      run: () => ({ ok: false, findings: [{ severity: 'error', message: 'broken' }] }),
      fix: (ctx: ICheckContext) => {
        ctx.writer.write('out.txt', 'x'); // throws — 'write' not declared
        return { fixed: 1 };
      },
    };
    const { exitCode, results } = await new CheckRunner(
      rosterOf([fixme]),
      adapters([]),
      recordingReporter().reporter,
    ).run({ tier: 'fast', fix: true }, { ci: false });
    expect(exitCode).toBe(1);
    expect(results[0].verdict.findings.some((f) => f.message.includes('fix failed'))).toBe(true);
  });

  it('does not attempt fixes without --fix', async () => {
    let fixCalled = false;
    const fixme: ICheck & IFixable = {
      ...check({ id: 'fixme', capabilities: ['write'], verdict: { ok: false, findings: [] } }),
      fix: () => {
        fixCalled = true;
        return { fixed: 0 };
      },
    };
    await new CheckRunner(rosterOf([fixme]), adapters([]), recordingReporter().reporter).run(
      { tier: 'fast' },
      { ci: false },
    );
    expect(fixCalled).toBe(false);
  });
});

describe('CheckRunner --fix over a check with no fix', () => {
  // It was silent: the red run after `--fix` read as a repair that failed.
  it('says the check has no fix, and still fails', async () => {
    const plain = check({ id: 'plain', verdict: { ok: false, findings: [{ severity: 'error', message: 'broken' }] } });
    const { exitCode, results } = await new CheckRunner(
      rosterOf([plain]),
      adapters([]),
      recordingReporter().reporter,
    ).run({ tier: 'fast', fix: true }, { ci: false });
    expect(exitCode).toBe(1);
    expect(results[0].verdict.findings.map((f) => f.message)).toEqual([
      'broken',
      'plain has no fix — --fix repairs only what a check can derive, and this one declares no repair.',
    ]);
  });

  it('says nothing about a passing check, or without --fix', async () => {
    const passing = check({ id: 'fine', verdict: { ok: true, findings: [] } });
    const failing = check({
      id: 'plain',
      verdict: { ok: false, findings: [{ severity: 'error', message: 'broken' }] },
    });
    const withFix = await new CheckRunner(rosterOf([passing]), adapters([]), recordingReporter().reporter).run(
      { tier: 'fast', fix: true },
      { ci: false },
    );
    const without = await new CheckRunner(rosterOf([failing]), adapters([]), recordingReporter().reporter).run(
      { tier: 'fast' },
      { ci: false },
    );
    expect(withFix.results[0].verdict.findings).toEqual([]);
    expect(without.results[0].verdict.findings.map((f) => f.message)).toEqual(['broken']);
  });
});
