import { describe, expect, it } from 'vitest';

import type { ICheckMeta, IVerdict } from '../../domain';
import { runCheck } from '../../testing';
import { ratchetDirection } from './ratchet-direction.check';

const ID = { id: 'ratchet-direction', title: 'a ratchet only turns one way', tier: 'fast' as const };

const run = (
  tree: Record<string, string>,
  options: { ceilings?: Record<string, number>; roster?: readonly ICheckMeta[] } = {},
): Promise<IVerdict> =>
  runCheck(ratchetDirection({ ...ID, ratchetFiles: '.specwarden/ratchets/*.json', ceilings: options.ceilings }), {
    tree,
    roster: options.roster,
  });

/** A roster entry declaring one ratchet, which is all this check reads off it. */
const declaring = (id: string, ceiling: number, direction?: 'down' | 'up'): ICheckMeta =>
  ({ id, ratchet: { id, ceiling, direction } }) as ICheckMeta;

describe('ratchetDirection', () => {
  it('is a product-zone check', () => {
    expect(ratchetDirection({ ...ID, ratchetFiles: 'x/*.json' }).zone).toBe('product');
  });

  it('passes a well-formed ratchet at or below its ceiling', async () => {
    const v = await run({ '.specwarden/ratchets/a.json': '{"id":"a","value":3}' }, { ceilings: { a: 3 } });
    expect(v.ok).toBe(true);
  });

  it('flags a ratchet raised above its declared ceiling', async () => {
    const v = await run({ '.specwarden/ratchets/a.json': '{"id":"a","value":5}' }, { ceilings: { a: 3 } });
    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('above the ceiling 3');
  });

  it('flags a file that will not parse', async () => {
    const v = await run({ '.specwarden/ratchets/a.json': '{ not json' });
    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('not valid JSON');
  });

  it('flags a value that is not a non-negative integer', async () => {
    const v = await run({ '.specwarden/ratchets/a.json': '{"id":"a","value":-1}' });
    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('non-negative integer');
  });

  it('flags a file whose stored id contradicts its filename', async () => {
    const v = await run({ '.specwarden/ratchets/a.json': '{"id":"b","value":0}' });
    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('must agree');
  });

  it('validates shape even without a declared ceiling', async () => {
    const v = await run({ '.specwarden/ratchets/a.json': '{"id":"a","value":2}' });
    expect(v.ok).toBe(true); // no ceiling → shape only, and the shape is fine
  });

  // ── the ceiling comes from the checks themselves ────────────────────────────────

  it('reads a ceiling off the check that declares it, with no second copy in the config', async () => {
    // The whole point: before this, every ceiling had to be repeated in the consumer's
    // config by hand, and the repeated copy is the one that drifts.
    const v = await run({ '.specwarden/ratchets/a.json': '{"id":"a","value":9}' }, { roster: [declaring('a', 3)] });
    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('above the ceiling 3');
  });

  it('lets an explicitly declared ceiling override the roster', async () => {
    const v = await run(
      { '.specwarden/ratchets/a.json': '{"id":"a","value":5}' },
      { roster: [declaring('a', 3)], ceilings: { a: 7 } },
    );
    expect(v.ok).toBe(true);
  });

  // ── direction ──────────────────────────────────────────────────────────────────

  it('a floor fails when the stored value falls BELOW it', async () => {
    // A score that only rises. Judged by the debt rule this would pass at any value,
    // which is why a floor could not live inside the mechanism before `direction`.
    const v = await run(
      { '.specwarden/ratchets/s.json': '{"id":"s","value":61}' },
      { roster: [declaring('s', 68, 'up')] },
    );
    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('below the floor 68');
  });

  it('a floor passes at or above its declared value', async () => {
    const v = await run(
      { '.specwarden/ratchets/s.json': '{"id":"s","value":71}' },
      { roster: [declaring('s', 68, 'up')] },
    );
    expect(v.ok).toBe(true);
  });

  it('a debt above its ceiling and a floor below its own are both caught in one run', async () => {
    const v = await run(
      { '.specwarden/ratchets/a.json': '{"id":"a","value":9}', '.specwarden/ratchets/s.json': '{"id":"s","value":10}' },
      { roster: [declaring('a', 3), declaring('s', 68, 'up')] },
    );
    expect(v.findings.filter((f) => f.severity === 'error')).toHaveLength(2);
  });
});
