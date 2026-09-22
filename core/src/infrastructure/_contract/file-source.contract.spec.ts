import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FileNotFoundError, type IFileSource } from '../../domain';
import { InMemoryFileSource } from '../in-memory-file-source/in-memory-file-source.adapter';
import { NodeFileSource } from '../node-file-source/node-file-source.adapter';

/**
 * ONE contract, both implementations. The in-memory source earns its keep only if
 * it answers exactly as the real one — otherwise every test written against it
 * measures a fiction, including the ones that prove the engine works on a
 * differently-shaped repository. So this suite runs against each, and the two
 * named-first cases are the ones a divergence hides in: a missing file, and a
 * directory where a file was asked for.
 */
const TREE: Readonly<Record<string, string>> = {
  'README.md': '# root\n',
  'docs/a.md': 'a\n',
  'docs/b.md': 'b\n',
  'docs/sub/c.md': 'c\n',
  'src/x.ts': 'x\n',
  // Dotfiles at three depths — the case a divergence between the two glob engines
  // hid in: a bare `*`/`**` must skip them (fs.globSync's default), an explicit-dot
  // segment must reach them, and both sources must agree on which.
  '.rootdot.md': 'r\n',
  'docs/.secret.md': 's\n',
  '.specwarden/r.json': '{}\n',
};

function buildNode(): { source: IFileSource; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'spw-fs-'));
  for (const [path, content] of Object.entries(TREE)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return { source: new NodeFileSource(dir), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const IMPLEMENTATIONS = [
  { name: 'NodeFileSource', build: buildNode },
  { name: 'InMemoryFileSource', build: () => ({ source: new InMemoryFileSource(TREE), cleanup: () => {} }) },
];

describe.each(IMPLEMENTATIONS)('IFileSource contract — $name', ({ build }) => {
  let source: IFileSource;
  let cleanup: () => void;
  beforeAll(() => {
    const built = build();
    source = built.source;
    cleanup = built.cleanup;
  });
  afterAll(() => cleanup());

  it('reads an existing file verbatim', () => {
    expect(source.read('docs/a.md')).toBe('a\n');
  });

  it('exists: true for a file and a directory, false for neither', () => {
    expect(source.exists('docs/a.md')).toBe(true);
    expect(source.exists('docs')).toBe(true);
    expect(source.exists('docs/missing.md')).toBe(false);
  });

  it('read throws FileNotFoundError on a missing file', () => {
    expect(() => source.read('docs/missing.md')).toThrow(FileNotFoundError);
  });

  it('read throws FileNotFoundError on a directory; isDirectory says so', () => {
    expect(source.isDirectory('docs')).toBe(true);
    expect(source.isDirectory('docs/a.md')).toBe(false);
    expect(() => source.read('docs')).toThrow(FileNotFoundError);
  });

  it('tryRead returns undefined for a missing file and for a directory', () => {
    expect(source.tryRead('nope.md')).toBeUndefined();
    expect(source.tryRead('docs')).toBeUndefined();
  });

  it('list returns immediate children sorted; throws on a non-directory', () => {
    // `list` enumerates everything, dotfiles included (it is not glob) — both sources agree.
    expect(source.list('docs')).toEqual(['.secret.md', 'a.md', 'b.md', 'sub']);
    expect(() => source.list('docs/a.md')).toThrow(FileNotFoundError);
    expect(() => source.list('nope')).toThrow(FileNotFoundError);
  });

  it('list at the root sees the top level', () => {
    expect(source.list('')).toEqual(['.rootdot.md', '.specwarden', 'README.md', 'docs', 'src']);
  });

  it('glob matches within a segment and across segments, sorted', () => {
    expect(source.glob('docs/*.md')).toEqual(['docs/a.md', 'docs/b.md']);
    expect(source.glob('**/*.ts')).toEqual(['src/x.ts']);
  });

  it('glob returns files only, never a directory a `**` would also match', () => {
    // `docs/**` matches the `docs/sub` directory too under a raw globber; a check
    // globs to read, so both sources must exclude it and yield only files.
    expect(source.glob('docs/**')).toEqual(['docs/a.md', 'docs/b.md', 'docs/sub/c.md']);
  });

  it('a bare `*`/`**` skips dotfiles; an explicit-dot segment reaches them — both sources agree', () => {
    // Bare wildcards exclude leading-dot components (fs.globSync default), so none of
    // .rootdot.md / docs/.secret.md / the .specwarden dir appear.
    expect(source.glob('**/*.md')).toEqual(['README.md', 'docs/a.md', 'docs/b.md', 'docs/sub/c.md']);
    expect(source.glob('*.md')).toEqual(['README.md']);
    expect(source.glob('docs/*.md')).toEqual(['docs/a.md', 'docs/b.md']);
    // Spelling the dot out reaches the dot-directory.
    expect(source.glob('.specwarden/*.json')).toEqual(['.specwarden/r.json']);
  });

  it('normalize is repo-relative and forward-slashed', () => {
    expect(source.normalize('docs/a.md')).toBe('docs/a.md');
    expect(source.normalize('./docs/a.md')).toBe('docs/a.md');
  });
});
