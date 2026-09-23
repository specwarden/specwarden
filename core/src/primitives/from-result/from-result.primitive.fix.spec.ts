import { describe, expect, it } from 'vitest';

import { isFixable } from '../../domain';
import { errorsOf, runCheck, testContext } from '../../testing';
import { fromResult } from './from-result.primitive';

/**
 * What `fromResult` adds around a plain function beyond carrying its problems: the
 * repair it may offer, the ratchet it is judged against, and the result that names
 * neither field. Each is a place the adapter could quietly change a verdict.
 */
describe('fromResult — a repair', () => {
  const fix = () => ({ fixed: 0 });

  it('adds `write` when it offers a repair, and only once', () => {
    expect(fromResult({ id: 'x', title: 'x', run: () => ({}), fix }).capabilities).toEqual(['read', 'write']);
    expect(fromResult({ id: 'x', title: 'x', capabilities: ['write'], run: () => ({}), fix }).capabilities).toEqual([
      'write',
    ]);
  });

  it('offers no fix and no `write` without a repair', () => {
    const check = fromResult({ id: 'x', title: 'x', run: () => ({}) });

    expect(check.capabilities).toEqual(['read']);
    expect(isFixable(check)).toBe(false);
  });

  it('exposes the repair as given, writing through the context it is handed', async () => {
    const check = fromResult({
      id: 'x',
      title: 'x',
      run: () => ({ errors: ['stale'] }),
      fix: (ctx) => {
        ctx.writer.write('gen.md', 'regenerated');
        return { fixed: 1 };
      },
    });
    const ctx = testContext();
    if (!isFixable(check)) throw new Error('a check declared with a repair offers none');

    expect(await check.fix(ctx)).toEqual({ fixed: 1 });
    expect(ctx.writes.get('gen.md')).toBe('regenerated');
  });
});

describe('fromResult — the ratchet', () => {
  const twoProblems = () => fromResult({ id: 'x', title: 'x', ratchet: 2, run: () => ({ errors: ['a', 'b'] }) });

  it('holds at its inline ratchet, framed as tolerated, and states the problem count', async () => {
    const verdict = await runCheck(twoProblems());

    expect(verdict.ok).toBe(true);
    expect(verdict.findings[0].message).toContain('tolerated under ratchet 2');
    expect(errorsOf(verdict)).toEqual(['a', 'b']);
    expect(verdict.ratchet).toEqual({ value: 2 });
  });

  it('fails when a stored ratchet is tighter than the inline one', async () => {
    expect((await runCheck(twoProblems(), { ratchet: 1 })).ok).toBe(false);
  });

  it('is strict with no ratchet at all: one problem fails', async () => {
    const verdict = await runCheck(fromResult({ id: 'x', title: 'x', run: () => ({ errors: ['a'] }) }));

    expect(verdict.ok).toBe(false);
  });
});

describe('fromResult — a result that names neither field', () => {
  /**
   * A function that returns only notes — or `{}` — found nothing wrong. Reading the
   * absent list as anything but empty would fail every such check, or worse, crash.
   */
  it('reads a result with neither `errors` nor `failures` as clean, and still says so', async () => {
    const verdict = await runCheck(fromResult({ id: 'x', title: 'x', run: () => ({}) }));

    expect(verdict.ok).toBe(true);
    expect(verdict.findings.map((f) => f.message)).toEqual(['✓ x — clean']);
    expect(verdict.ratchet).toEqual({ value: 0 });
  });

  it('prefers `errors` when a result carries both names', async () => {
    const verdict = await runCheck(
      fromResult({ id: 'x', title: 'x', run: () => ({ errors: ['from errors'], failures: ['from failures'] }) }),
    );

    expect(errorsOf(verdict)).toEqual(['from errors']);
  });

  it('awaits an async function', async () => {
    const verdict = await runCheck(fromResult({ id: 'x', title: 'x', run: async () => ({ failures: ['late'] }) }));

    expect(errorsOf(verdict)).toEqual(['late']);
  });
});
