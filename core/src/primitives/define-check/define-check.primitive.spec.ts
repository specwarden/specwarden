import { describe, expect, it } from 'vitest';

import { CHECK_CONTRACT_VERSION, type IFinding } from '../../domain';
import { errorsOf, runCheck } from '../../testing';
import { type TCheckOutcome, defineCheck } from './define-check.primitive';

/**
 * What is pinned here is everything a check body would otherwise have written for
 * itself — and every one of these cases is a shape that was written by hand, wrongly
 * or inconsistently, somewhere in the first consumer's check corpus.
 */

const error = (message: string, over: Partial<IFinding> = {}): IFinding => ({ severity: 'error', message, ...over });

const build = (run: () => TCheckOutcome, options: Record<string, unknown> = {}) =>
  defineCheck({ id: 'x', title: 'x', run, ...options });

describe('defineCheck', () => {
  // ── the ceremony it owns ───────────────────────────────────────────────────────

  it('defaults the identity a check file would otherwise type out', () => {
    const check = build(() => []);

    expect(check.zone).toBe('consumer');
    expect(check.capabilities).toEqual(['read']);
    expect(check.tier).toBe('fast');
    // A literal here is how a check keeps loading after a contract bump — the one
    // failure the version field exists to prevent, and it was written as a literal.
    expect(check.contractVersion).toBe(CHECK_CONTRACT_VERSION);
  });

  it('carries the declarations a hand-written literal was reached for', () => {
    const check = build(() => [], {
      tier: 'heavy',
      exclusive: true,
      advisory: true,
      hint: 'do the thing',
      capabilities: ['read', 'exec'],
      ratchetId: 'x',
      ratchetDirection: 'up',
      ratchet: 4,
    });

    expect(check.tier).toBe('heavy');
    expect(check.exclusive).toBe(true);
    expect(check.advisory).toBe(true);
    expect(check.hint).toBe('do the thing');
    expect(check.capabilities).toEqual(['read', 'exec']);
    expect(check.ratchet).toEqual({ id: 'x', direction: 'up', ceiling: 4 });
  });

  it('attributes every finding to the check, so nothing is left untraceable', async () => {
    const verdict = await runCheck(build(() => [error('bad'), { ...error('worse'), ruleId: 'other' }]));

    expect(verdict.findings.map((f) => f.ruleId)).toEqual(['x', 'other']);
  });

  it('attributes to a named rule when the check enforces one under another name', async () => {
    const verdict = await runCheck(build(() => [error('bad')], { ruleId: 'the-rule' }));

    expect(verdict.findings[0].ruleId).toBe('the-rule');
  });

  // ── the verdict it assembles ───────────────────────────────────────────────────

  it('passes on no findings, and still says something', async () => {
    const verdict = await runCheck(build(() => []));

    expect(verdict.ok).toBe(true);
    // A verdict with no findings renders as a blank line, which reads as "did not run".
    expect(verdict.findings).toHaveLength(1);
    expect(verdict.findings[0].message).toContain('✓ x');
  });

  it('says WHAT it examined when the body reports a count', async () => {
    const verdict = await runCheck(build(() => ({ findings: [], examined: 438, unit: 'documents' })));

    expect(verdict.findings[0].message).toContain('438 documents examined');
  });

  it('fails on an error finding and drops the clean line', async () => {
    const verdict = await runCheck(build(() => [error('bad')]));

    expect(verdict.ok).toBe(false);
    expect(verdict.findings.map((f) => f.message)).toEqual(['bad']);
  });

  it('a warning alone does not fail the check', async () => {
    const verdict = await runCheck(build(() => [{ severity: 'warning', message: 'hmm' }]));

    expect(verdict.ok).toBe(true);
  });

  it('renders notes as info and keeps them beside failures', async () => {
    const verdict = await runCheck(build(() => ({ findings: [error('bad')], notes: ['read 4 files'] })));

    expect(verdict.ok).toBe(false);
    expect(verdict.findings.map((f) => f.severity)).toEqual(['info', 'error']);
  });

  it('accepts a bare finding array as the short form', async () => {
    expect((await runCheck(build(() => [error('bad')]))).ok).toBe(false);
    expect((await runCheck(build(() => []))).ok).toBe(true);
  });

  it('awaits an async body', async () => {
    const check = defineCheck({ id: 'x', title: 'x', run: () => Promise.resolve([error('bad')]) });

    expect((await runCheck(check)).ok).toBe(false);
  });

  // ── the ratchet ────────────────────────────────────────────────────────────────

  it('holds at its inline ratchet and fails one past it', async () => {
    const two = () => [error('a'), error('b')];

    expect((await runCheck(build(two, { ratchet: 2 }))).ok).toBe(true);
    expect((await runCheck(build(two, { ratchet: 1 }))).ok).toBe(false);
  });

  it('a stored threshold overrides the inline one', async () => {
    const check = build(() => [error('a'), error('b')], { ratchetId: 'x', ratchet: 5 });

    expect((await runCheck(check, { ratchet: 1 })).ok).toBe(false);
  });

  it('frames a tolerated pass, so a wall of errors under a green tick is explained', async () => {
    const verdict = await runCheck(build(() => [error('a')], { ratchet: 1 }));

    expect(verdict.ok).toBe(true);
    expect(verdict.findings[0].message).toContain('tolerated');
  });

  it('states the measurement on the verdict, so --tighten never has to guess', async () => {
    const verdict = await runCheck(build(() => [error('a'), error('b')], { ratchet: 2 }));

    expect(verdict.ratchet).toEqual({ value: 2 });
  });

  it('a body that SUMMARISES reports its own number, which the findings do not show', async () => {
    // The defect this closes: three checks emitted one info line while passing under a
    // ratchet of 17 and 37. Counting error findings gives 0, and --tighten would have
    // written that 0 into the store.
    const verdict = await runCheck(build(() => ({ findings: [], measured: 17, examined: 400 }), { ratchet: 17 }));

    expect(verdict.ok).toBe(true);
    expect(verdict.ratchet).toEqual({ value: 17 });
  });

  it('a summarised measurement past the ratchet still fails', async () => {
    const verdict = await runCheck(build(() => ({ findings: [], measured: 18 }), { ratchet: 17 }));

    expect(verdict.ok).toBe(false);
  });

  it('an `up` ratchet fails BELOW its floor and holds at or above it', async () => {
    const at = (score: number) =>
      build(() => ({ findings: [], measured: score }), { ratchet: 68, ratchetDirection: 'up' });

    expect((await runCheck(at(61))).ok).toBe(false);
    expect((await runCheck(at(68))).ok).toBe(true);
    expect((await runCheck(at(71))).ok).toBe(true);
  });

  // ── the corpus floor ───────────────────────────────────────────────────────────

  it('fails when it examined fewer units than it declared it must', async () => {
    const verdict = await runCheck(
      build(() => ({ findings: [], examined: 0, unit: 'documents' }), { corpus: { atLeast: 1 } }),
    );

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)[0]).toContain('examined 0 documents');
  });

  it('carries the consumer’s own reason when it has one', async () => {
    const verdict = await runCheck(
      build(() => ({ findings: [], examined: 0 }), { corpus: { atLeast: 1, why: 'the marker pattern broke.' } }),
    );

    expect(errorsOf(verdict)[0]).toContain('the marker pattern broke.');
  });

  it('passes at the floor exactly', async () => {
    const verdict = await runCheck(build(() => ({ findings: [], examined: 1 }), { corpus: { atLeast: 1 } }));

    expect(verdict.ok).toBe(true);
  });

  it('an empty corpus outranks a clean finding list — that pass is the defect', async () => {
    const verdict = await runCheck(build(() => ({ findings: [], examined: 0 }), { corpus: { atLeast: 3 } }));

    expect(verdict.ok).toBe(false);
  });

  it('a body that reports no count is not judged against the floor', async () => {
    // Nothing was claimed, so nothing is refuted. The alternative — treating an absent
    // count as zero — would fail every check that does not opt in.
    const verdict = await runCheck(build(() => [], { corpus: { atLeast: 3 } }));

    expect(verdict.ok).toBe(true);
  });

  // ── relevance ──────────────────────────────────────────────────────────────────

  it('is always relevant when nothing is declared', () => {
    expect(build(() => []).when([])).toBe(true);
  });

  it('takes the declarative form', () => {
    const check = build(() => [], { when: { under: ['src/'], ending: ['.md'] } });

    expect(check.when(['src/a.ts'])).toBe(true);
    expect(check.when(['README.md'])).toBe(true);
    expect(check.when(['other/a.ts'])).toBe(false);
  });

  it('takes a predicate', () => {
    const check = build(() => [], { when: (changed: readonly string[]) => changed.includes('x') });

    expect(check.when(['x'])).toBe(true);
    expect(check.when(['y'])).toBe(false);
  });
});

/**
 * A check with BOTH a hard rule and a ratcheted total. Coverage is the real instance:
 * the floors must hold on every run, and the uncovered-unit debt may only fall. One
 * `ok` rule covering both would let a floor breach ride under a debt ceiling that
 * happened to hold — which is the number being green while the thing it measures is not.
 */
describe('defineCheck — findings and a measurement, together', () => {
  const both = (errors: number, measured: number, ratchet: number) =>
    defineCheck({
      id: 'x',
      title: 'x',
      ratchet,
      run: () => ({
        findings: Array.from({ length: errors }, (_, i) => ({ severity: 'error' as const, message: `e${i}` })),
        measured,
      }),
    });

  it('fails on an error finding even when the measurement is under its ceiling', async () => {
    expect((await runCheck(both(1, 10, 100))).ok).toBe(false);
  });

  it('fails on a measurement over its ceiling even with no error finding', async () => {
    expect((await runCheck(both(0, 120, 100))).ok).toBe(false);
  });

  it('passes only when both hold', async () => {
    expect((await runCheck(both(0, 100, 100))).ok).toBe(true);
  });

  it('but without a stated measurement the findings are the debt, and the ratchet tolerates them', async () => {
    const debtOnly = defineCheck({
      id: 'x',
      title: 'x',
      ratchet: 3,
      run: () => [
        { severity: 'error' as const, message: 'a' },
        { severity: 'error' as const, message: 'b' },
      ],
    });

    expect((await runCheck(debtOnly)).ok).toBe(true);
  });
});
