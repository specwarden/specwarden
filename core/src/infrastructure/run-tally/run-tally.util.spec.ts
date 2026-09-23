import { describe, expect, it } from 'vitest';

import type { ICheckResult } from '../../domain';
import { tallyRun } from './run-tally.util';

const result = (id: string, ok: boolean, advisory = false, skipped?: string): ICheckResult =>
  ({ meta: { id, advisory }, verdict: { ok, findings: [] }, skipped, durationMs: 0 }) as unknown as ICheckResult;

describe('tallyRun — one count of a run, whichever reporter prints it', () => {
  it('counts a passing advisory check as passed, a failing one as warned, never as passed', () => {
    const tally = tallyRun([
      result('a', true),
      result('advice-held', true, true),
      result('advice-broke', false, true),
      result('b', false),
      result('c', true, false, 'by-request'),
    ]);
    expect(tally.passed).toBe(2);
    expect(tally.failed.map((r) => r.meta.id)).toEqual(['b']);
    expect(tally.warned).toBe(1);
    expect(tally.skipped).toBe(1);
  });

  it('a skipped check is not counted as having held, whatever its verdict placeholder says', () => {
    expect(tallyRun([result('s', true, false, 'not-relevant')]).passed).toBe(0);
  });
});
