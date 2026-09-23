import { describe, expect, it } from 'vitest';

import { asGitGlob, isLiteralPathspec, matchPathspec, pathspecMatcher } from './git-pathspec.util';

/**
 * The edges of the one pathspec reading. The cases that matter most — root files under
 * `**`, a star that must not descend, a directory named literally — are held against real
 * git in `_contract/vcs.contract.spec.ts`; these are the spellings a config might use that
 * the contract's tree does not happen to contain.
 */
describe('a pathspec', () => {
  it('asks git in glob mode, and leaves a pathspec that already carries magic alone', () => {
    expect(asGitGlob('**/*.md')).toBe(':(glob)**/*.md');
    expect(asGitGlob(':(exclude)dist')).toBe(':(exclude)dist');
  });

  it('is literal only when it has no wildcard at all', () => {
    expect(isLiteralPathspec('docs/_plans')).toBe(true);
    expect(isLiteralPathspec('docs/*.md')).toBe(false);
    expect(isLiteralPathspec('file?.md')).toBe(false);
    expect(isLiteralPathspec('[ab].md')).toBe(false);
  });

  it('reads `./docs/` and `docs` as the same directory', () => {
    const paths = ['docs/a.md', 'docsite/b.md'];
    expect(matchPathspec('./docs/', paths)).toEqual(['docs/a.md']);
    expect(matchPathspec('docs', paths)).toEqual(['docs/a.md']);
  });

  it('matches `?` as exactly one character inside a segment', () => {
    const match = pathspecMatcher('v?.md');
    expect(match('v1.md')).toBe(true);
    expect(match('v10.md')).toBe(false);
    expect(match('v/.md')).toBe(false);
  });

  it('reads a bracket as a character class, negated by `!`, and a lone bracket as itself', () => {
    expect(matchPathspec('[ab].md', ['a.md', 'b.md', 'c.md'])).toEqual(['a.md', 'b.md']);
    expect(matchPathspec('[!ab].md', ['a.md', 'c.md'])).toEqual(['c.md']);
    expect(matchPathspec('odd[.md', ['odd[.md', 'odd.md'])).toEqual(['odd[.md']);
  });

  it('escapes what a regular expression would otherwise read', () => {
    // `.` in a pathspec is a dot, not "any character" — `a+b.md` is a filename.
    expect(matchPathspec('a+b.md', ['a+b.md', 'aab.md', 'a+bxmd'])).toEqual(['a+b.md']);
  });

  it('treats `.` and an empty pathspec as the whole index', () => {
    expect(matchPathspec('.', ['a', 'b/c'])).toEqual(['a', 'b/c']);
    expect(matchPathspec(undefined, ['a'])).toEqual(['a']);
  });
});
