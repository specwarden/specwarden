import { describe, expect, it } from 'vitest';

import { CheckRunner } from './check-runner.service';
import { adapters, check, recordingReporter, registryOf } from './check-runner.service.spec-helpers';

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
      registryOf([fixme]),
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
      registryOf([fixme]),
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
    await new CheckRunner(registryOf([fixme]), adapters([]), recordingReporter().reporter).run(
      { tier: 'fast' },
      { ci: false },
    );
    expect(fixCalled).toBe(false);
  });
});
