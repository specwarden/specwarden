import { describe, expect, it } from 'vitest';

import { checkOptions } from '../../primitives/_shared/check-options/check-options.util';
import { FactoryAuditError, publishedFactories, uncoveredFactories } from './published-factories.util';

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

describe('factories that check their options', () => {
  /**
   * The regression this pins: factories now refuse options they do not know, so the
   * union probe is refused by every one of them. Read as "threw, so a helper", every
   * factory became a helper, the audit found none, and reported none uncovered.
   */
  const strict = (id: string) => (options: Record<string, unknown>) => {
    checkOptions(id, options, { in: { kind: 'string', required: true } });
    return { id, run: () => ({ ok: true, findings: [] }) };
  };
  const STRICT = {
    forbidThing: strict('forbidThing'),
    requireThing: strict('requireThing'),
    thingPreset: () => [
      { id: 'a', run: () => ({ ok: true, findings: [] }) },
      { id: 'b', run: () => ({ ok: true, findings: [] }) },
    ],
    thingPlugin: () => ({ name: 'p', checks: [{ id: 'c', run: () => ({ ok: true, findings: [] }) }] }),
    parseThing: (text: string) => text.split(','),
    emptyList: () => [],
  };
  const UNION = { id: 'probe', title: 'probe', tier: 'fast', in: 'x', somethingOnlyAnotherFactoryTakes: 1 };

  it('counts a factory that refuses the probe by name as a factory, not a helper', () => {
    expect(publishedFactories(STRICT, UNION)).toContain('forbidThing');
    expect(publishedFactories(STRICT, UNION)).toContain('requireThing');
  });

  it('counts a preset returning checks and a plugin carrying checks, and nothing that returns an empty list', () => {
    const found = publishedFactories(STRICT, UNION);

    expect(found).toEqual(['forbidThing', 'requireThing', 'thingPlugin', 'thingPreset']);
    expect(found).not.toContain('emptyList');
    expect(found).not.toContain('parseThing');
  });

  it('still names the factory a claim forgot', () => {
    expect(
      uncoveredFactories(STRICT, { covered: ['forbidThing', 'thingPreset', 'thingPlugin'], probe: UNION }),
    ).toEqual(['requireThing']);
  });

  it('refuses a claim none of whose names it could recognise — the audit would have read nothing and passed', () => {
    expect(() => uncoveredFactories(STRICT, { covered: ['parseThing', 'emptyList'], probe: UNION })).toThrow(
      FactoryAuditError,
    );
    expect(() => uncoveredFactories(STRICT, { covered: ['parseThing'], probe: UNION })).toThrow(
      'would have examined nothing and passed',
    );
  });

  it('asks nothing of a caller that claims to cover nothing', () => {
    expect(uncoveredFactories(STRICT, { covered: [], probe: UNION })).toEqual([
      'forbidThing',
      'requireThing',
      'thingPlugin',
      'thingPreset',
    ]);
  });
});
