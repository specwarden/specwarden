import { describe, expect, it } from 'vitest';

import type { ICheckContext } from '../../domain';
import { errorsOf, runCheck } from '../../testing';
import { sourcesAgree } from './sources-agree.primitive';

/**
 * Two sources describe one set. The defect is ASYMMETRY: a check that only asks "is
 * everything in A also in B" is silent about the service added to B and forgotten in
 * A, which is the half that breaks a running system. Both directions are pinned.
 */
const ID = { id: 'services-agree', title: 'compose and table agree', tier: 'fast' as const };

const lines = (path: string) => (ctx: ICheckContext) =>
  ctx.files
    .read(path)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

const check = sourcesAgree({
  ...ID,
  a: { name: 'compose.txt', extract: lines('compose.txt') },
  b: { name: 'table.txt', extract: lines('table.txt') },
});

describe('sourcesAgree — the refusing verdict', () => {
  it('fails on a member of A missing from B, naming both sources', async () => {
    const verdict = await runCheck(check, { tree: { 'compose.txt': 'api\ndb\n', 'table.txt': 'api\n' } });

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)).toEqual(['`db` is in compose.txt but not table.txt.']);
  });

  it('fails on a member of B missing from A — the direction a one-sided check never sees', async () => {
    const verdict = await runCheck(check, { tree: { 'compose.txt': 'api\n', 'table.txt': 'api\ncache\n' } });

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)).toEqual(['`cache` is in table.txt but not compose.txt.']);
  });

  it('reports both directions at once, A’s surplus first', async () => {
    const verdict = await runCheck(check, { tree: { 'compose.txt': 'api\ndb\n', 'table.txt': 'api\ncache\n' } });

    expect(errorsOf(verdict)).toEqual([
      '`db` is in compose.txt but not table.txt.',
      '`cache` is in table.txt but not compose.txt.',
    ]);
    expect(verdict.findings.every((f) => f.ruleId === 'services-agree')).toBe(true);
  });

  it('refuses a disagreement even when one side is empty', async () => {
    const verdict = await runCheck(check, { tree: { 'compose.txt': 'api\n', 'table.txt': '' } });

    expect(errorsOf(verdict)).toEqual(['`api` is in compose.txt but not table.txt.']);
  });
});

describe('sourcesAgree — the passing verdict', () => {
  it('passes when both describe the same set, whatever the order', async () => {
    const verdict = await runCheck(check, { tree: { 'compose.txt': 'api\ndb\n', 'table.txt': 'db\napi\n' } });

    expect(verdict.ok).toBe(true);
    expect(errorsOf(verdict)).toEqual([]);
    expect(verdict.findings).toEqual([{ severity: 'info', message: '✓ services-agree — 2 name(s) examined, clean' }]);
  });

  it('compares SETS — a name listed twice on one side is not a disagreement', async () => {
    const verdict = await runCheck(check, { tree: { 'compose.txt': 'api\napi\n', 'table.txt': 'api\n' } });

    expect(verdict.ok).toBe(true);
  });

  /**
   * Two empty sources used to agree, so an extractor that stopped matching on BOTH sides
   * after a format change passed. Nothing can tell that from a system with no services,
   * so the check refuses it by default and a consumer who expects an empty set says so.
   */
  it('refuses two empty sides — agreement over nothing is what an extractor that stopped matching produces', async () => {
    const verdict = await runCheck(check, { tree: { 'compose.txt': '', 'table.txt': '' } });

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)).toEqual([
      expect.stringContaining('neither compose.txt nor table.txt described a single name'),
    ]);
  });

  it('accepts two empty sides only when the check declares an empty set is expected', async () => {
    const lenient = sourcesAgree({
      ...ID,
      a: { name: 'compose.txt', extract: lines('compose.txt') },
      b: { name: 'table.txt', extract: lines('table.txt') },
      corpus: { atLeast: 0 },
    });

    expect((await runCheck(lenient, { tree: { 'compose.txt': '', 'table.txt': '' } })).ok).toBe(true);
  });

  it('declares only `read`, and hands both extractors the same context', async () => {
    const seen: ICheckContext[] = [];
    const spy = sourcesAgree({
      ...ID,
      a: { name: 'a', extract: (ctx) => (seen.push(ctx), ['x']) },
      b: { name: 'b', extract: (ctx) => (seen.push(ctx), ['x']) },
    });
    await runCheck(spy);

    expect(spy.capabilities).toEqual(['read']);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
  });
});
