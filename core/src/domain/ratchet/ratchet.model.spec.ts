import { describe, expect, it } from 'vitest';

import { isTighter, satisfiesRatchet, tightenedTo } from './ratchet.model';

/**
 * One definition of "forward", used by the store, the runner and the at-rest audit.
 * Three copies of this arithmetic is how a floor ends up being tightened to zero.
 */
describe('ratchet direction', () => {
  describe('down — a debt count', () => {
    it('is tighter when it falls', () => {
      expect(isTighter(5, 3)).toBe(true);
      expect(isTighter(5, 7)).toBe(false);
      expect(isTighter(5, 5)).toBe(false);
    });

    it('discards a worse measurement rather than persisting it', () => {
      expect(tightenedTo(5, 3)).toBe(3);
      expect(tightenedTo(5, 9)).toBe(5);
    });

    it('is satisfied at or below the threshold', () => {
      expect(satisfiesRatchet(3, 3)).toBe(true);
      expect(satisfiesRatchet(2, 3)).toBe(true);
      expect(satisfiesRatchet(4, 3)).toBe(false);
    });
  });

  describe('up — a score floor', () => {
    it('is tighter when it rises', () => {
      expect(isTighter(68, 71, 'up')).toBe(true);
      expect(isTighter(68, 61, 'up')).toBe(false);
      expect(isTighter(68, 68, 'up')).toBe(false);
    });

    it('discards a drop', () => {
      expect(tightenedTo(68, 71, 'up')).toBe(71);
      expect(tightenedTo(68, 61, 'up')).toBe(68);
    });

    it('is satisfied at or above the threshold', () => {
      expect(satisfiesRatchet(68, 68, 'up')).toBe(true);
      expect(satisfiesRatchet(71, 68, 'up')).toBe(true);
      expect(satisfiesRatchet(61, 68, 'up')).toBe(false);
    });
  });

  it('defaults to the debt counter, so nothing written before the direction existed changes', () => {
    expect(isTighter(5, 3)).toBe(isTighter(5, 3, 'down'));
    expect(tightenedTo(5, 3)).toBe(tightenedTo(5, 3, 'down'));
    expect(satisfiesRatchet(3, 3)).toBe(satisfiesRatchet(3, 3, 'down'));
  });
});
