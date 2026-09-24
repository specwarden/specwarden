import { describe, expect, it } from 'vitest';

import { CHECK_CONTRACT_VERSION } from '../../domain';
import { fromResult } from './from-result.primitive';

/**
 * The adapter carries an answer it does not understand, so what is worth pinning is every
 * shape it must not lose: the three problem forms, the notes that explain a PASS, and the
 * empty verdict that would otherwise print as nothing at all.
 *
 * The three forms are not a design — they are what the twenty check functions in this
 * corpus really return. A rewrite that "normalises" them is where a verdict changes, which
 * is why the adapter accepts them rather than the callers being edited to suit it.
 */
describe('fromResult', () => {
  const check = (run: () => ReturnType<Parameters<typeof fromResult>[0]['run']>) =>
    fromResult({ id: 'x', title: 'x', when: () => true, run });

  const ctx = {} as never;

  it('passes when there is nothing wrong, and still says something', async () => {
    const verdict = await check(() => ({ failures: [] })).run(ctx);

    expect(verdict.ok).toBe(true);
    // A verdict with no findings renders as a blank line, which reads as "did not run" —
    // indistinguishable from the failure mode this whole engine exists against.
    expect(verdict.findings).toHaveLength(1);
    expect(verdict.findings[0]?.message).toContain('clean');
  });

  it('accepts `errors` and `failures` as the same field', async () => {
    expect((await check(() => ({ errors: ['bad'] })).run(ctx)).ok).toBe(false);
    expect((await check(() => ({ failures: ['bad'] })).run(ctx)).ok).toBe(false);
  });

  it('carries a plain string problem through as an error finding', async () => {
    const verdict = await check(() => ({ failures: ['the thing is wrong'] })).run(ctx);

    expect(verdict.findings[0]).toMatchObject({ severity: 'error', message: 'the thing is wrong', ruleId: 'x' });
  });

  it('keeps the file of a { file, message } problem', async () => {
    const verdict = await check(() => ({ failures: [{ file: 'a/b.ts', message: 'wrong' }] })).run(ctx);

    expect(verdict.findings[0]).toMatchObject({ file: 'a/b.ts', message: 'wrong' });
  });

  it('joins a { where, what, fix } problem into one message, keeping `where` as the file', async () => {
    const verdict = await check(() => ({
      failures: [{ where: 'a/b.ts', what: 'the spec sits beside its subject', fix: 'move it into the folder' }],
    })).run(ctx);

    expect(verdict.findings[0]).toMatchObject({
      file: 'a/b.ts',
      message: 'the spec sits beside its subject → move it into the folder',
    });
  });

  it('does not lose a problem whose shape it cannot read', async () => {
    const verdict = await check(() => ({ failures: [{ where: 'a/b.ts' }] })).run(ctx);

    // Dropping it would turn an unreadable finding into a PASS — the one direction that
    // must never happen. Printing the raw object is ugly and correct.
    expect(verdict.ok).toBe(false);
    expect(verdict.findings[0]?.message).toContain('a/b.ts');
  });

  it('renders notes as info, and notes alone do not fail the check', async () => {
    const verdict = await check(() => ({ failures: [], notes: ['checked 4 files', 'SKIPPED: no refs'] })).run(ctx);

    expect(verdict.ok).toBe(true);
    expect(verdict.findings.map((f) => f.severity)).toEqual(['info', 'info']);
  });

  it('keeps notes alongside failures — the context is what makes a failure actionable', async () => {
    const verdict = await check(() => ({ failures: ['bad'], notes: ['checked 4 files'] })).run(ctx);

    expect(verdict.ok).toBe(false);
    expect(verdict.findings).toHaveLength(2);
  });

  it('attributes findings to the rule when the check enforces one under another name', async () => {
    const withRule = fromResult({
      id: 'x',
      title: 'x',
      rule: { id: 'the-rule', statement: 'the thing holds' },
      when: () => true,
      run: () => ({ failures: ['bad'] }),
    });

    expect((await withRule.run(ctx)).findings[0]?.ruleId).toBe('the-rule');
  });

  it('declares the contract version the engine speaks, so the roster accepts it', async () => {
    // A hard-coded number here is how a check silently stops being registerable after a
    // contract bump — the roster refuses it, and the gate it implements disappears.
    expect(check(() => ({ failures: [] })).contractVersion).toBe(CHECK_CONTRACT_VERSION);
  });

  it('defaults to the fast tier and reads only', async () => {
    const built = check(() => ({ failures: [] }));

    expect(built.tier).toBe('fast');
    expect(built.capabilities).toEqual(['read']);
  });
});
