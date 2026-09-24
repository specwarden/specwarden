import { describe, expect, it } from 'vitest';

import { expandBraces, MAX_ALTERNATIVES, MAX_LENGTH } from './brace-expansion.util';

/**
 * Every case below was recorded from Node 24.21's own minimatch (`braceExpand`, which
 * `fs.globSync` runs a pattern through first) — so this is the engine's expansion held to
 * the runtime's, not to what somebody believed bash does.
 */
describe('expandBraces', () => {
  it.each([
    ['a', ['a']],
    ['{a,b}', ['a', 'b']],
    ['{a,b}{1,2}', ['a1', 'a2', 'b1', 'b2']],
    ['x{a,b}y', ['xay', 'xby']],
    ['{,a}', ['a']],
    ['a{,b}', ['a', 'ab']],
    ['{a}', ['{a}']],
    ['{}', ['{}']],
    ['{}a', ['{}a']],
    ['{}{a,b}', ['{}a', '{}b']],
    ['{}{,a}', ['{}', '{}a']],
    ['{a},b}', ['a}', 'b']],
    ['x{a},b}y', ['xa}y', 'xby']],
    ['{a}{1..3}', ['{a}{1..3}']],
    ['{a}{b,c}', ['{a}b', '{a}c']],
    ['{{a,b}}', ['{a}', '{b}']],
    ['x{{a,b}}y', ['x{a}y', 'x{b}y']],
    ['{a,{b,c}d,e}', ['a', 'bd', 'cd', 'e']],
    ['{a,{b,c},d}', ['a', 'b', 'c', 'd']],
    ['{a,b{c,d}}', ['a', 'bc', 'bd']],
    ['{1..3}', ['1', '2', '3']],
    ['{3..1}', ['3', '2', '1']],
    ['{1..10..3}', ['1', '4', '7', '10']],
    ['{10..1..3}', ['10', '7', '4', '1']],
    ['{1..3..0}', ['1', '2', '3']],
    ['{-1..1}', ['-1', '0', '1']],
    ['{01..03}', ['01', '02', '03']],
    ['{1..03}', ['01', '02', '03']],
    ['{-01..1}', ['-01', '000', '001']],
    ['{a..c}', ['a', 'b', 'c']],
    ['{c..a}', ['c', 'b', 'a']],
    ['{a..e..2}', ['a', 'c', 'e']],
    ['{Z..b}', ['Z', '[', '', ']', '^', '_', '`', 'a', 'b']],
    ['{a..3}', ['{a..3}']],
    ['{1..}', ['{1..}']],
    ['${a,b}', ['${a,b}']],
    ['a${b,c}d', ['a${b,c}d']],
    ['{{a}', ['{{a}']],
    ['a}{b,c}', ['a}b', 'a}c']],
    ['{a', ['{a']],
    ['a}', ['a}']],
    ['}{', ['}{']],
    ['{a,b', ['{a,b']],
    ['{{a,b},c}', ['a', 'b', 'c']],
    ['{a,,b}', ['a', 'b']],
    ['{,}', []],
    ['{,,}', []],
    ['{a/b,c}/d', ['a/b/d', 'c/d']],
    ['{**/*.md,src/*.ts}', ['**/*.md', 'src/*.ts']],
    ['*.{js,mjs}{,.map}', ['*.js', '*.js.map', '*.mjs', '*.mjs.map']],
    ['{x..z}{1..2}', ['x1', 'x2', 'y1', 'y2', 'z1', 'z2']],
  ])('%s', (pattern, expected) => {
    expect(expandBraces(pattern)).toEqual(expected);
  });

  it('expands nothing out of nothing: an empty pattern matches no file', () => {
    expect(expandBraces('')).toEqual([]);
  });

  // Uncapped, `{a,b}` twenty times took 56 s and 1.4 GB before a directory was read.
  // Each case below matched Node 24.21 in length, first and last member.
  it.each([
    ['a sequence', '{1..200000}', '1', '100000'],
    ['alternations that multiply', '{a,b}'.repeat(17), 'a'.repeat(17), 'bbaaaabbabaabbbbb'],
    ['alternations past a million', '{a,b}'.repeat(20), 'a'.repeat(20), 'aaabbaaaabbabaabbbbb'],
  ])('stops where Node stops: %s', (_what, pattern, first, last) => {
    const expanded = expandBraces(pattern);
    expect(expanded).toHaveLength(MAX_ALTERNATIVES);
    expect([expanded[0], expanded[expanded.length - 1]]).toEqual([first, last]);
  });

  // Also recorded from Node 24.21: a brace holding only `${…}` is kept whole, with or without
  // text after it; an unbalanced run pairs its innermost brace; empties inside a brace stay.
  it.each([
    ['x{${a,b}}y', ['x{${a,b}}y']],
    ['x{${a,b}}', ['x{${a,b}}']],
    ['{{a}{b}', ['{{a}{b}']],
    ['{a,}x{,}', ['ax', 'ax', 'x', 'x']],
    ['{,}{a,}', ['a', 'a']],
  ])('%s', (pattern, expected) => {
    expect(expandBraces(pattern)).toEqual(expected);
  });

  it('caps a sequence by length, and a brace by count, as Node does', () => {
    const padded = expandBraces(`{${'0'.repeat(39)}1..100000}`);
    expect(padded).toHaveLength(100_000);
    expect(padded.reduce((n, e) => n + e.length, 0)).toBe(MAX_LENGTH);
    expect(padded[padded.length - 1]).toBe(`${'0'.repeat(34)}100000`);

    const inner = expandBraces('{{1..200000},x}');
    expect([inner.length, inner[0], inner[inner.length - 1]]).toEqual([100_000, '1', '100000']);
  });

  it('stops at the length Node stops at, however few the alternatives', () => {
    const long = `{${'x'.repeat(50)},${'y'.repeat(50)}}`.repeat(16);
    const expanded = expandBraces(long);
    expect(expanded).toHaveLength(5000);
    expect(expanded.reduce((n, e) => n + e.length, 0)).toBeLessThanOrEqual(MAX_LENGTH);
  });
});
