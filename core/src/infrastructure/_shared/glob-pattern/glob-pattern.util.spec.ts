import { describe, expect, it } from 'vitest';

import { compileGlob, GLOBSTAR, NestedExtglobError, platformGlobOptions, type GlobSegment } from './glob-pattern.util';

/** The names each wildcard segment is tried against. */
const NAMES = [
  'a',
  'b',
  'ab',
  'x',
  'A',
  '.a',
  '.',
  '..',
  'x.md',
  'X.MD',
  'a.md',
  '[',
  'a[b',
  'Ü',
  '1',
  'x1',
  '!',
  'a b',
];

/** A segment as the table writes it: `**`, a literal name, or the NAMES a pattern matches. */
const described = (seg: GlobSegment) =>
  seg === GLOBSTAR ? '**' : typeof seg === 'string' ? { literal: seg } : { matches: NAMES.filter((n) => seg.test(n)) };

/**
 * Every row was recorded from Node 24.21's own minimatch, constructed with the options
 * `fs.globSync` passes it: the segment lists a walk visits (`globParts`) and, for each
 * segment, whether it is `**`, a literal looked up by name, or a pattern — and which names
 * that pattern matches, with case and without.
 */
describe('compileGlob', () => {
  it.each([
    ['**/**/x', false, [['**', 'x']], [['**', { literal: 'x' }]]],
    ['a/./b', false, [['a', 'b']], [[{ literal: 'a' }, { literal: 'b' }]]],
    ['a//b', false, [['a', 'b']], [[{ literal: 'a' }, { literal: 'b' }]]],
    ['a/b/../c', false, [['a', 'c']], [[{ literal: 'a' }, { literal: 'c' }]]],
    ['*/../x', false, [['x']], [[{ literal: 'x' }]]],
    ['a/..', false, [['']], [[{ literal: '' }]]],
    ['./x', false, [['.', 'x']], [[{ literal: '.' }, { literal: 'x' }]]],
    ['./.', false, [['.']], [[{ literal: '.' }]]],
    ['./', false, [['.']], [[{ literal: '.' }]]],
    ['docs/', false, [['docs', '']], [[{ literal: 'docs' }, { literal: '' }]]],
    [
      '/abs/*',
      false,
      [['', 'abs', '*']],
      [
        [
          { literal: '' },
          { literal: 'abs' },
          { matches: ['a', 'b', 'ab', 'x', 'A', 'x.md', 'X.MD', 'a.md', '[', 'a[b', 'Ü', '1', 'x1', '!', 'a b'] },
        ],
      ],
    ],
    [
      '**/../a/b/*.md',
      false,
      [
        ['..', 'a', 'b', '*.md'],
        ['**', 'a', 'b', '*.md'],
      ],
      [
        [{ literal: '..' }, { literal: 'a' }, { literal: 'b' }, { matches: ['x.md', 'a.md'] }],
        ['**', { literal: 'a' }, { literal: 'b' }, { matches: ['x.md', 'a.md'] }],
      ],
    ],
    ['{a,a}/b', false, [['a', 'b']], [[{ literal: 'a' }, { literal: 'b' }]]],
    ['a[b].txt', false, [['a[b].txt']], [[{ literal: 'ab.txt' }]]],
    ['[.]a', false, [['[.]a']], [[{ literal: '.a' }]]],
    ['a[b', false, [['a[b']], [[{ literal: 'a[b' }]]],
    ['x@y', false, [['x@y']], [[{ literal: 'x@y' }]]],
    ['a(b)', false, [['a(b)']], [[{ literal: 'a(b)' }]]],
    ['#a', false, [['#a']], [[{ literal: '#a' }]]],
    ['!a', false, [['!a']], [[{ literal: '!a' }]]],
    ['**a', false, [['**a']], [[{ matches: ['a'] }]]],
    ['a**b', false, [['a**b']], [[{ matches: ['ab', 'a[b', 'a b'] }]]],
    [
      '*',
      false,
      [['*']],
      [[{ matches: ['a', 'b', 'ab', 'x', 'A', 'x.md', 'X.MD', 'a.md', '[', 'a[b', 'Ü', '1', 'x1', '!', 'a b'] }]],
    ],
    ['.*', false, [['.*']], [[{ matches: ['.a'] }]]],
    ['..*', false, [['..*']], [[{ matches: [] }]]],
    ['.?', false, [['.?']], [[{ matches: ['.a'] }]]],
    ['?', false, [['?']], [[{ matches: ['a', 'b', 'x', 'A', '[', 'Ü', '1', '!'] }]]],
    ['[a.]*', false, [['[a.]*']], [[{ matches: ['a', 'ab', 'a.md', 'a[b', 'a b'] }]]],
    ['[ab]', false, [['[ab]']], [[{ matches: ['a', 'b'] }]]],
    ['[!a]', false, [['[!a]']], [[{ matches: ['b', 'x', 'A', '[', 'Ü', '1', '!'] }]]],
    ['[^a]', false, [['[^a]']], [[{ matches: ['b', 'x', 'A', '[', 'Ü', '1', '!'] }]]],
    ['[a-]', false, [['[a-]']], [[{ matches: ['a'] }]]],
    ['[-a]', false, [['[-a]']], [[{ matches: ['a'] }]]],
    ['[]]', false, [['[]]']], [[{ literal: ']' }]]],
    ['[!]]', false, [['[!]]']], [[{ matches: ['a', 'b', 'x', 'A', '[', 'Ü', '1', '!'] }]]],
    ['[z-a]', false, [['[z-a]']], [[{ matches: [] }]]],
    ['[a-[:alpha:]]', false, [['[a-[:alpha:]]']], [[{ matches: [] }]]],
    ['[[:alpha:]]', false, [['[[:alpha:]]']], [[{ matches: ['a', 'b', 'x', 'A', 'Ü'] }]]],
    ['[[:digit:]x]', false, [['[[:digit:]x]']], [[{ matches: ['x', '1'] }]]],
    ['[[:graph:]]', false, [['[[:graph:]]']], [[{ matches: ['a', 'b', 'x', 'A', '[', 'Ü', '1', '!'] }]]],
    ['[[:ascii:]]', false, [['[[:ascii:]]']], [[{ matches: ['a', 'b', 'x', 'A', '[', '1', '!'] }]]],
    ['[[:bogus:]]', false, [['[[:bogus:]]']], [[{ matches: [] }]]],
    ['@(a|b)', false, [['@(a|b)']], [[{ matches: ['a', 'b'] }]]],
    [
      '!(a|b)',
      false,
      [['!(a|b)']],
      [[{ matches: ['ab', 'x', 'A', 'x.md', 'X.MD', 'a.md', '[', 'a[b', 'Ü', '1', 'x1', '!', 'a b'] }]],
    ],
    ['!(a)b', false, [['!(a)b']], [[{ matches: ['b', 'a[b', 'a b'] }]]],
    ['?(a)x', false, [['?(a)x']], [[{ matches: ['x'] }]]],
    ['+(a)', false, [['+(a)']], [[{ matches: ['a'] }]]],
    ['*(a)b', false, [['*(a)b']], [[{ matches: ['b', 'ab'] }]]],
    ['@()', false, [['@()']], [[{ literal: '@()' }]]],
    [
      '!()',
      false,
      [['!()']],
      [[{ matches: ['a', 'b', 'ab', 'x', 'A', 'x.md', 'X.MD', 'a.md', '[', 'a[b', 'Ü', '1', 'x1', '!', 'a b'] }]],
    ],
    ['@(|a)', false, [['@(|a)']], [[{ matches: ['a'] }]]],
    ['@(a|b', false, [['@(a|b']], [[{ literal: '@(a|b' }]]],
    ['@(a|[b)', false, [['@(a|[b)']], [[{ literal: '@(a|[b)' }]]],
    ['a[b@(c)', false, [['a[b@(c)']], [[{ literal: 'a[b@(c)' }]]],
    ['@(.a|b)', false, [['@(.a|b)']], [[{ matches: ['b', '.a'] }]]],
    ['*(.a)', false, [['*(.a)']], [[{ matches: ['.a'] }]]],
    ['x!(y)', false, [['x!(y)']], [[{ matches: ['x', 'x.md', 'x1'] }]]],
    ['**/**/x', true, [['**', 'x']], [['**', { literal: 'x' }]]],
    ['a/./b', true, [['a', 'b']], [[{ literal: 'a' }, { literal: 'b' }]]],
    ['a//b', true, [['a', 'b']], [[{ literal: 'a' }, { literal: 'b' }]]],
    ['a/b/../c', true, [['a', 'c']], [[{ literal: 'a' }, { literal: 'c' }]]],
    ['*/../x', true, [['x']], [[{ literal: 'x' }]]],
    ['a/..', true, [['']], [[{ literal: '' }]]],
    ['./x', true, [['.', 'x']], [[{ literal: '.' }, { literal: 'x' }]]],
    ['./.', true, [['.']], [[{ literal: '.' }]]],
    ['./', true, [['.']], [[{ literal: '.' }]]],
    ['docs/', true, [['docs', '']], [[{ literal: 'docs' }, { literal: '' }]]],
    [
      '/abs/*',
      true,
      [['', 'abs', '*']],
      [
        [
          { literal: '' },
          { literal: 'abs' },
          { matches: ['a', 'b', 'ab', 'x', 'A', 'x.md', 'X.MD', 'a.md', '[', 'a[b', 'Ü', '1', 'x1', '!', 'a b'] },
        ],
      ],
    ],
    [
      '**/../a/b/*.md',
      true,
      [
        ['..', 'a', 'b', '*.md'],
        ['**', 'a', 'b', '*.md'],
      ],
      [
        [{ literal: '..' }, { literal: 'a' }, { literal: 'b' }, { matches: ['x.md', 'X.MD', 'a.md'] }],
        ['**', { literal: 'a' }, { literal: 'b' }, { matches: ['x.md', 'X.MD', 'a.md'] }],
      ],
    ],
    ['{a,a}/b', true, [['a', 'b']], [[{ literal: 'a' }, { literal: 'b' }]]],
    ['a[b].txt', true, [['a[b].txt']], [[{ literal: 'ab.txt' }]]],
    ['[.]a', true, [['[.]a']], [[{ literal: '.a' }]]],
    ['a[b', true, [['a[b']], [[{ literal: 'a[b' }]]],
    ['x@y', true, [['x@y']], [[{ literal: 'x@y' }]]],
    ['a(b)', true, [['a(b)']], [[{ literal: 'a(b)' }]]],
    ['#a', true, [['#a']], [[{ literal: '#a' }]]],
    ['!a', true, [['!a']], [[{ literal: '!a' }]]],
    ['**a', true, [['**a']], [[{ matches: ['a', 'A'] }]]],
    ['a**b', true, [['a**b']], [[{ matches: ['ab', 'a[b', 'a b'] }]]],
    [
      '*',
      true,
      [['*']],
      [[{ matches: ['a', 'b', 'ab', 'x', 'A', 'x.md', 'X.MD', 'a.md', '[', 'a[b', 'Ü', '1', 'x1', '!', 'a b'] }]],
    ],
    ['.*', true, [['.*']], [[{ matches: ['.a'] }]]],
    ['..*', true, [['..*']], [[{ matches: [] }]]],
    ['.?', true, [['.?']], [[{ matches: ['.a'] }]]],
    ['?', true, [['?']], [[{ matches: ['a', 'b', 'x', 'A', '[', 'Ü', '1', '!'] }]]],
    ['[a.]*', true, [['[a.]*']], [[{ matches: ['a', 'ab', 'A', 'a.md', 'a[b', 'a b'] }]]],
    ['[ab]', true, [['[ab]']], [[{ matches: ['a', 'b', 'A'] }]]],
    ['[!a]', true, [['[!a]']], [[{ matches: ['b', 'x', '[', 'Ü', '1', '!'] }]]],
    ['[^a]', true, [['[^a]']], [[{ matches: ['b', 'x', '[', 'Ü', '1', '!'] }]]],
    ['[a-]', true, [['[a-]']], [[{ matches: ['a', 'A'] }]]],
    ['[-a]', true, [['[-a]']], [[{ matches: ['a', 'A'] }]]],
    ['[]]', true, [['[]]']], [[{ literal: ']' }]]],
    ['[!]]', true, [['[!]]']], [[{ matches: ['a', 'b', 'x', 'A', '[', 'Ü', '1', '!'] }]]],
    ['[z-a]', true, [['[z-a]']], [[{ matches: [] }]]],
    ['[a-[:alpha:]]', true, [['[a-[:alpha:]]']], [[{ matches: [] }]]],
    ['[[:alpha:]]', true, [['[[:alpha:]]']], [[{ matches: ['a', 'b', 'x', 'A', 'Ü'] }]]],
    ['[[:digit:]x]', true, [['[[:digit:]x]']], [[{ matches: ['x', '1'] }]]],
    ['[[:graph:]]', true, [['[[:graph:]]']], [[{ matches: ['a', 'b', 'x', 'A', '[', 'Ü', '1', '!'] }]]],
    ['[[:ascii:]]', true, [['[[:ascii:]]']], [[{ matches: ['a', 'b', 'x', 'A', '[', '1', '!'] }]]],
    ['[[:bogus:]]', true, [['[[:bogus:]]']], [[{ matches: [] }]]],
    ['@(a|b)', true, [['@(a|b)']], [[{ matches: ['a', 'b', 'A'] }]]],
    [
      '!(a|b)',
      true,
      [['!(a|b)']],
      [[{ matches: ['ab', 'x', 'x.md', 'X.MD', 'a.md', '[', 'a[b', 'Ü', '1', 'x1', '!', 'a b'] }]],
    ],
    ['!(a)b', true, [['!(a)b']], [[{ matches: ['b', 'a[b', 'a b'] }]]],
    ['?(a)x', true, [['?(a)x']], [[{ matches: ['x'] }]]],
    ['+(a)', true, [['+(a)']], [[{ matches: ['a', 'A'] }]]],
    ['*(a)b', true, [['*(a)b']], [[{ matches: ['b', 'ab'] }]]],
    ['@()', true, [['@()']], [[{ literal: '@()' }]]],
    [
      '!()',
      true,
      [['!()']],
      [[{ matches: ['a', 'b', 'ab', 'x', 'A', 'x.md', 'X.MD', 'a.md', '[', 'a[b', 'Ü', '1', 'x1', '!', 'a b'] }]],
    ],
    ['@(|a)', true, [['@(|a)']], [[{ matches: ['a', 'A'] }]]],
    ['@(a|b', true, [['@(a|b']], [[{ literal: '@(a|b' }]]],
    ['@(a|[b)', true, [['@(a|[b)']], [[{ literal: '@(a|[b)' }]]],
    ['a[b@(c)', true, [['a[b@(c)']], [[{ literal: 'a[b@(c)' }]]],
    ['@(.a|b)', true, [['@(.a|b)']], [[{ matches: ['b', '.a'] }]]],
    ['*(.a)', true, [['*(.a)']], [[{ matches: ['.a'] }]]],
    ['x!(y)', true, [['x!(y)']], [[{ matches: ['x', 'x.md', 'X.MD', 'x1'] }]]],
  ] as const)('%s (nocase %s)', (pattern, nocase, parts, segments) => {
    const compiled = compileGlob(pattern, { nocase, windows: false });
    expect(compiled.map((c) => c.parts)).toEqual(parts);
    expect(compiled.map((c) => c.segments.map(described))).toEqual(segments);
  });

  // Recorded from Node 24.21 as well: `x/..` before a `**` leaves a `.` to root the walk;
  // `[a-a]` is one character; and a class mixing a range with a NEGATED POSIX class is left
  // without the leading-dot guard, because minimatch compiles it to `(…|…)` — so it matches
  // `.` itself where every other class does not.
  it.each([
    ['a/../**/x', [['.', '**', 'x']], [[{ literal: '.' }, '**', { literal: 'x' }]]],
    ['[a-a]x', [['[a-a]x']], [[{ literal: 'ax' }]]],
    ['[x[:graph:]]', [['[x[:graph:]]']], [[{ matches: ['a', 'b', 'x', 'A', '.', '[', 'Ü', '1', '!'] }]]],
    ['[[:graph:]]x', [['[[:graph:]]x']], [[{ matches: [] }]]],
  ] as const)('%s', (pattern, parts, segments) => {
    const compiled = compileGlob(pattern, { nocase: false, windows: false });
    expect(compiled.map((c) => c.parts)).toEqual(parts);
    expect(compiled.map((c) => c.segments.map(described))).toEqual(segments);
  });

  it('compiles nothing out of an empty pattern: it matches no file', () => {
    expect(compileGlob('', { nocase: false, windows: false })).toEqual([]);
  });

  it('keeps a Windows drive and a UNC root as roots, never as patterns', () => {
    const windows = { nocase: true, windows: true };
    expect(compileGlob('C:/x/*.md', windows)[0]?.segments[0]).toBe('C:');
    expect(compileGlob('//host/share/x', windows)[0]?.parts).toEqual(['', '', 'host', 'share', 'x']);
    expect(compileGlob('//host/share/x', { nocase: false, windows: false })[0]?.parts).toEqual([
      '',
      'host',
      'share',
      'x',
    ]);
  });

  it('ignores case in a wildcard segment on win32 and darwin, and nowhere else', () => {
    expect(platformGlobOptions('win32')).toEqual({ nocase: true, windows: true });
    expect(platformGlobOptions('darwin')).toEqual({ nocase: true, windows: false });
    expect(platformGlobOptions('linux')).toEqual({ nocase: false, windows: false });
  });

  // Built without minimatch's flattening, `!(*(a|aa))b` backtracked exponentially — 704 ms
  // on a 34-character name — and `!(!(a))b` matched `ab`, which Node does not.
  it.each(['!(*(a|aa))b', '@(!(a))b', '!(!(a))b', 'x/+(a|@(b|c))/y'])(
    'refuses an extglob inside an extglob, naming the segment: %s',
    (pattern) => {
      const refusal = (): unknown => compileGlob(pattern, { nocase: false, windows: false });
      expect(refusal).toThrow(NestedExtglobError);
      expect(refusal).toThrow(/an extglob inside another .* write the alternatives out/);
    },
  );

  it('reads extglobs side by side, and an unclosed one as text — neither is nesting', () => {
    const plain = { nocase: false, windows: false };
    expect(compileGlob('+(a|b)+(c)', plain)).toHaveLength(1);
    expect(compileGlob('@(a|!(b)', plain)[0]?.segments[0]).toBeInstanceOf(RegExp);
  });
});
