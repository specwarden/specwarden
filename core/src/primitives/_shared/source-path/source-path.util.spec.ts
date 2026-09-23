import { describe, expect, it } from 'vitest';

import { InMemoryFileSource } from '../../../infrastructure';
import { dirOf, joinDir, lineOf, pathMatches, stem } from './source-path.util';

/**
 * Positions and names read out of a path or a file. Every finding a primitive emits
 * carries a line from `lineOf` and every sibling it demands is spelled by `stem` and
 * `joinDir` — an off-by-one here points every reader at the wrong line, in every check
 * at once.
 */
describe('lineOf', () => {
  const content = 'one\ntwo\nthree\n';

  it('is 1-indexed: the first character is on line 1', () => {
    expect(lineOf(content, 0)).toBe(1);
  });

  it('counts the newlines BEFORE the offset, so a match at the start of a line is on that line', () => {
    expect(lineOf(content, content.indexOf('two'))).toBe(2);
    expect(lineOf(content, content.indexOf('three'))).toBe(3);
  });

  it('puts the newline character itself on the line it ends', () => {
    expect(lineOf(content, content.indexOf('\n'))).toBe(1);
  });

  it('counts a CRLF line ending once, not twice', () => {
    const crlf = 'one\r\ntwo\r\nthree';

    expect(lineOf(crlf, crlf.indexOf('three'))).toBe(3);
  });

  it('stops at the end of the content for an offset past it', () => {
    expect(lineOf('a\nb', 999)).toBe(2);
  });
});

describe('stem', () => {
  it('drops only the LAST extension, so a role suffix survives into {name}', () => {
    expect(stem('src/a/foo.service.ts')).toBe('foo.service');
  });

  it('keeps a name that has no extension whole', () => {
    expect(stem('bin/specwarden')).toBe('specwarden');
    expect(stem('Makefile')).toBe('Makefile');
  });

  it('reads only the basename — a dot in a directory is not an extension', () => {
    expect(stem('pkg.v2/src/index')).toBe('index');
  });
});

describe('dirOf and joinDir', () => {
  it('dirOf is the parent, and "" at the root', () => {
    expect(dirOf('docs/sub/a.md')).toBe('docs/sub');
    expect(dirOf('README.md')).toBe('');
  });

  it('joinDir never produces a leading slash for a root-level file', () => {
    // `/a.spec.ts` would be absolute to the file source, and every sibling at the
    // repository root would be reported missing.
    expect(joinDir('', 'a.spec.ts')).toBe('a.spec.ts');
    expect(joinDir('src/a', 'a.spec.ts')).toBe('src/a/a.spec.ts');
  });

  it('round-trips: joining a file back onto its own directory names the same file', () => {
    for (const path of ['a.md', 'docs/a.md', 'docs/sub/deep/a.md']) {
      expect(joinDir(dirOf(path), path.slice(path.lastIndexOf('/') + 1))).toBe(path);
    }
  });
});

describe('pathMatches', () => {
  it('asks the active file source, so Node and in-memory give one answer', () => {
    const ctx = { files: new InMemoryFileSource({ 'docs/a.md': '', 'src/x.ts': '' }) };

    expect(pathMatches(ctx, 'docs/*.md', 'docs/a.md')).toBe(true);
    expect(pathMatches(ctx, 'docs/*.md', 'src/x.ts')).toBe(false);
  });

  it('is false for a path that would match the glob but is not in the tree', () => {
    const ctx = { files: new InMemoryFileSource({ 'docs/a.md': '' }) };

    expect(pathMatches(ctx, 'docs/*.md', 'docs/ghost.md')).toBe(false);
  });
});
