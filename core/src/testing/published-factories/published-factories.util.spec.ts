import { describe, expect, it } from 'vitest';

import { publishedFactories, uncoveredFactories } from './published-factories.util';

/**
 * The cases are the three shapes a real barrel mixes: a factory, a parser that refuses
 * the probe, and a parser that accepts it and returns something else. The last one is
 * the reason the test is "returns a check" rather than "did not throw".
 */
const BARREL = {
  makeCheck: (options: { id: string }) => ({ id: options.id, run: () => ({ ok: true, findings: [] }) }),
  alsoACheck: () => ({ id: 'second', run: () => ({ ok: true, findings: [] }) }),
  parseText: (text: string) => text.split('\n'),
  countOf: () => 7,
  NOT_A_FACTORY: () => ({ id: 'upper', run: () => ({ ok: true, findings: [] }) }),
  SOME_CONSTANT: ['a', 'b'],
};

const PROBE = { id: 'probe', title: 'probe', tier: 'fast' as const };

describe('publishedFactories', () => {
  it('finds the exports that produce a check', () => {
    expect(publishedFactories(BARREL, PROBE)).toEqual(['alsoACheck', 'makeCheck']);
  });

  it('a helper that THROWS on the probe is not a factory', () => {
    // `parseText` reaches for `.split` on an object. That is the answer "not a factory",
    // and it must not take the whole scan down with it.
    expect(publishedFactories(BARREL, PROBE)).not.toContain('parseText');
  });

  it('a helper that ACCEPTS the probe and returns something else is not a factory either', () => {
    // The case a try/catch alone would get wrong: nothing threw, and the result is still
    // not a check.
    expect(publishedFactories(BARREL, PROBE)).not.toContain('countOf');
  });

  it('leaves upper-cased exports alone — calling a class or a constant proves nothing', () => {
    expect(publishedFactories(BARREL, PROBE)).not.toContain('NOT_A_FACTORY');
  });
});

describe('uncoveredFactories', () => {
  it('is empty when the claim names every factory', () => {
    expect(uncoveredFactories(BARREL, { covered: ['makeCheck', 'alsoACheck'], probe: PROBE })).toEqual([]);
  });

  /** The whole point: a factory added and never exercised has to fail somewhere. */
  it('names a factory the claim forgot', () => {
    expect(uncoveredFactories(BARREL, { covered: ['makeCheck'], probe: PROBE })).toEqual(['alsoACheck']);
  });

  it('does not complain about a covered name that is not a factory', () => {
    expect(uncoveredFactories(BARREL, { covered: ['makeCheck', 'alsoACheck', 'parseText'], probe: PROBE })).toEqual([]);
  });
});
