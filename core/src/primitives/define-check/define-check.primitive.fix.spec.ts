import { describe, expect, it } from 'vitest';

import { type IFinding, isFixable } from '../../domain';
import { errorsOf, runCheck, testContext } from '../../testing';
import { defineCheck } from './define-check.primitive';

/**
 * The two declarations that change what a check is ALLOWED to do or conclude: a repair
 * (which writes) and a corpus floor (which can overrule the body's own findings). Both
 * are where a check stops being able to fail honestly — a repair handed a writer that
 * throws, or a floor refusal that loses the measurement `--tighten` reads.
 */
const error = (message: string): IFinding => ({ severity: 'error', message });

describe('defineCheck — a repair', () => {
  const fix = () => ({ fixed: 1, summary: 'regenerated' });

  /**
   * Declaring a repair and forgetting `write` would hand the fix a writer that throws,
   * turning a working repair into a capability error nobody would read as one.
   */
  it('adds `write` to what it declares when it offers a repair', () => {
    expect(defineCheck({ id: 'x', title: 'x', run: () => [], fix }).capabilities).toEqual(['read', 'write']);
    expect(defineCheck({ id: 'x', title: 'x', capabilities: ['exec'], run: () => [], fix }).capabilities).toEqual([
      'exec',
      'write',
    ]);
  });

  it('does not declare `write` twice when the check already asked for it', () => {
    const check = defineCheck({ id: 'x', title: 'x', capabilities: ['read', 'write'], run: () => [], fix });

    expect(check.capabilities).toEqual(['read', 'write']);
  });

  it('declares no `write` — and offers no fix — when it has no repair', () => {
    const check = defineCheck({ id: 'x', title: 'x', run: () => [] });

    expect(check.capabilities).toEqual(['read']);
    expect(isFixable(check)).toBe(false);
  });

  it('exposes the repair it was given, which the engine runs against the context', async () => {
    const check = defineCheck({
      id: 'x',
      title: 'x',
      run: () => [],
      fix: (ctx) => {
        ctx.writer.write('out.md', 'fresh');
        return { fixed: 1, summary: 'wrote out.md' };
      },
    });
    const ctx = testContext();
    if (!isFixable(check)) throw new Error('a check declared with a repair offers none');
    const outcome = await check.fix(ctx);

    expect(outcome).toEqual({ fixed: 1, summary: 'wrote out.md' });
    expect(ctx.writes.get('out.md')).toBe('fresh');
  });
});

describe('defineCheck — the corpus floor refusal', () => {
  /**
   * The refusal replaces the body's findings with one sentence, but the MEASUREMENT
   * survives: the verdict still states the debt the body saw, rather than a 0 nobody
   * measured that a ratchet reader would take at its word.
   */
  it('keeps the error count as its measurement when it refuses an empty corpus', async () => {
    const check = defineCheck({
      id: 'x',
      title: 'x',
      corpus: { atLeast: 5 },
      run: () => ({ findings: [error('a'), error('b'), { severity: 'info', message: 'n' }], examined: 1 }),
    });
    const verdict = await runCheck(check);

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)).toHaveLength(1);
    expect(errorsOf(verdict)[0]).toMatch(/^examined 1 items, below the declared floor of 5/);
    expect(verdict.ratchet).toEqual({ value: 2 });
  });

  it('keeps a stated measurement over the error count when it refuses', async () => {
    const check = defineCheck({
      id: 'x',
      title: 'x',
      corpus: { atLeast: 2 },
      run: () => ({ findings: [error('a')], examined: 0, measured: 40, unit: 'modules' }),
    });
    const verdict = await runCheck(check);

    expect(errorsOf(verdict)[0]).toContain('examined 0 modules');
    expect(verdict.ratchet).toEqual({ value: 40 });
  });
});

describe('defineCheck — an outcome object without findings', () => {
  it('reads a missing `findings` as clean rather than failing on undefined', async () => {
    const verdict = await runCheck(
      defineCheck({ id: 'x', title: 'x', run: () => ({ examined: 3, notes: ['saw 3'] }) }),
    );

    expect(verdict.ok).toBe(true);
    expect(verdict.findings.map((f) => f.message)).toEqual(['✓ x — 3 items examined, clean', 'saw 3']);
  });
});
