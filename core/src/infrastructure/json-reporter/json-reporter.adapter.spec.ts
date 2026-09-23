import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ICheckMeta, ICheckResult } from '../../domain';
import { JsonReporter } from './json-reporter.adapter';

/**
 * The machine-facing reporter. Its consumer is a program, so the invariants are about
 * SHAPE: exactly one parseable document per run, every selected check in it — skipped
 * ones included — and the fields a CI annotation keys on, typed the same way every time.
 */
const meta = (id: string, extra: Partial<ICheckMeta> = {}): ICheckMeta => ({
  id,
  title: id,
  tier: 'fast',
  zone: 'consumer',
  capabilities: [],
  contractVersion: 1,
  ...extra,
});

const result = (id: string, over: Partial<ICheckResult> = {}, extra: Partial<ICheckMeta> = {}): ICheckResult => ({
  meta: meta(id, extra),
  verdict: { ok: true, findings: [] },
  durationMs: 10,
  ...over,
});

function capture(): { reporter: JsonReporter; chunks: string[] } {
  const chunks: string[] = [];
  return { reporter: new JsonReporter((t) => chunks.push(t)), chunks };
}

describe('JsonReporter', () => {
  /**
   * Anything written before the end is a second JSON value in the stream, and a
   * consumer calling `JSON.parse` on the whole output fails on the first byte of it.
   */
  it('emits nothing while checks run — not at start, not per check', () => {
    const { reporter, chunks } = capture();
    reporter.checkStarted(meta('a'));
    reporter.checkFinished(result('a'));

    expect(chunks).toEqual([]);
  });

  it('emits exactly ONE document at the end, however many checks ran', () => {
    const { reporter, chunks } = capture();
    for (const id of ['a', 'b', 'c']) {
      reporter.checkStarted(meta(id));
      reporter.checkFinished(result(id));
    }
    reporter.runFinished([result('a'), result('b'), result('c')], 42);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].endsWith('\n')).toBe(true);
    const doc = JSON.parse(chunks[0]);
    expect(doc.totalMs).toBe(42);
    expect(doc.results.map((r: { id: string }) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('carries every field a consumer keys on, for a pass, a failure, an advisory warning and a skip', () => {
    const { reporter, chunks } = capture();
    const finding = { severity: 'error' as const, message: 'bad', file: 'x.ts', line: 3 };
    reporter.runFinished(
      [
        result('pass', { durationMs: 5 }, { tier: 'heavy' }),
        result('fail', { verdict: { ok: false, findings: [finding] } }),
        result('warn', { verdict: { ok: false, findings: [] } }, { advisory: true }),
        result('skip', { skipped: 'by-request' }),
      ],
      100,
    );
    const [pass, fail, warn, skip] = JSON.parse(chunks[0]).results;

    expect(pass).toEqual({
      id: 'pass',
      tier: 'heavy',
      advisory: false,
      skipped: null,
      ok: true,
      durationMs: 5,
      findings: [],
    });
    expect(fail).toMatchObject({ id: 'fail', ok: false, advisory: false, findings: [finding] });
    // `advisory` is a boolean, never absent: a consumer filtering on `=== false` must
    // not drop every check that simply did not declare it.
    expect(warn).toMatchObject({ id: 'warn', ok: false, advisory: true });
    // `null`, not absent, for a check that ran — the key is always there to test.
    expect(pass.skipped).toBeNull();
    expect(skip).toMatchObject({ id: 'skip', skipped: 'by-request' });
  });

  it('emits a valid, empty document for a run that selected nothing', () => {
    const { reporter, chunks } = capture();
    reporter.runFinished([], 0);

    expect(JSON.parse(chunks[0])).toEqual({ totalMs: 0, results: [] });
  });

  describe('its default sink', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('writes the document to the process stdout when no sink is given', () => {
      const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      new JsonReporter().runFinished([], 7);

      expect(write).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(write.mock.calls[0][0]))).toEqual({ totalMs: 7, results: [] });
    });
  });
});
