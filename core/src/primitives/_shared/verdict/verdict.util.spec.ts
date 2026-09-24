import { describe, expect, it } from 'vitest';

import type { IFinding } from '../../../domain';
import { thresholdOf, verdictFrom } from './verdict.util';

const errors = (n: number): IFinding[] =>
  Array.from({ length: n }, (_, i) => ({ severity: 'error', message: `e${i}` }));

describe('verdictFrom', () => {
  it('holds a debt count at or below its threshold, and states what it measured', () => {
    expect(verdictFrom(errors(2), 2)).toMatchObject({ ok: true, measured: 2 });
    expect(verdictFrom(errors(3), 2)).toMatchObject({ ok: false, measured: 3 });
    expect(verdictFrom(errors(1))).toMatchObject({ ok: false, measured: 1 });
  });

  // The direction was dropped: an `up` ratchet was read as a debt ceiling, so a count that
  // FELL below its bar passed — a score that dropped was a green run.
  it('honours an `up` ratchet — below the threshold fails, at or above holds', () => {
    expect(verdictFrom(errors(2), { threshold: 3, direction: 'up' }).ok).toBe(false);
    expect(verdictFrom(errors(3), { threshold: 3, direction: 'up' }).ok).toBe(true);
    expect(verdictFrom(errors(4), { threshold: 3, direction: 'up' }).ok).toBe(true);
    expect(verdictFrom(errors(4), { threshold: 3 }).ok).toBe(false);
  });
});

describe('thresholdOf', () => {
  const check = (ratchet?: { id: string; ceiling?: number; direction?: 'up' | 'down' }) => ({ ratchet });

  it('is the stored threshold first, the declared ceiling next, strict last — with the declared direction', () => {
    expect(thresholdOf({ threshold: 4 }, check({ id: 'x', ceiling: 9, direction: 'up' }))).toEqual({
      threshold: 4,
      direction: 'up',
    });
    expect(thresholdOf({}, check({ id: 'x', ceiling: 9 }))).toEqual({ threshold: 9, direction: 'down' });
    expect(thresholdOf({}, check())).toEqual({ threshold: 0, direction: 'down' });
  });
});
