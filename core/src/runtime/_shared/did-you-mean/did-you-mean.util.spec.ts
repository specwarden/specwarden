import { describe, expect, it } from 'vitest';

import { didYouMean, nearest } from './did-you-mean.util';

const IDS = ['no-todo', 'doc-paths', 'doc-links', 'doc-lints', 'secret-scan', 'unit', 'lint'];

describe('didYouMean — the known name meant, or nothing', () => {
  it.each([
    ['a dropped letter', 'no-tod', ['no-todo']],
    ['an added letter', 'no-todoo', ['no-todo']],
    ['a transposition', 'no-tood', ['no-todo']],
    ['a wrong case', 'NO-TODO', ['no-todo']],
    ['a prefix', 'secret', ['secret-scan']],
    ['two equally close, both, in the order known', 'doc-link', ['doc-links', 'doc-lints']],
  ])('%s: %s → %j', (_, word, expected) => {
    expect(nearest(word, IDS)).toEqual(expected);
  });

  it('suggests nothing for a name far from every known one — a wrong suggestion is followed', () => {
    expect(nearest('typecheck', IDS)).toEqual([]);
    expect(didYouMean('typecheck', IDS)).toBe('');
  });

  it('a short name must be one edit away, not a quarter of nothing', () => {
    expect(nearest('lnit', IDS)).toEqual(['unit', 'lint']);
    expect(nearest('xy', IDS)).toEqual([]);
  });

  it('never suggests the name itself, and never more than three', () => {
    expect(nearest('unit', IDS)).toEqual([]);
    expect(nearest('a', ['b', 'c', 'd', 'e'])).toHaveLength(3);
  });

  it('phrases the tail of a refusal', () => {
    expect(didYouMean('no-tod', IDS)).toBe(" — did you mean 'no-todo'?");
    expect(didYouMean('doc-link', IDS)).toBe(" — did you mean 'doc-links' or 'doc-lints'?");
  });
});
