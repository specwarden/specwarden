import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NodeFileWriter } from './node-file-writer.adapter';

/**
 * The write port's real adapter, against a real temp directory. It is the only thing
 * `--fix` writes through, so the question is narrow and physical: do the bytes land
 * where the READ port would look for them?
 */
describe('NodeFileWriter', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'spw-writer-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /**
   * A check addresses files repository-relative through the read port. A writer that
   * resolved against the process cwd instead would "fix" a file in whatever directory
   * the CLI happened to be started from, and the re-run would report the same failure.
   */
  it('resolves a repository-relative path against the root, not the process cwd', () => {
    new NodeFileWriter(root).write('out.txt', 'hello');

    expect(readFileSync(join(root, 'out.txt'), 'utf8')).toBe('hello');
    expect(existsSync(join(process.cwd(), 'out.txt'))).toBe(false);
  });

  it('creates the parent directories a regenerated artifact needs', () => {
    new NodeFileWriter(root).write('docs/generated/deep/map.md', '# map\n');

    expect(readFileSync(join(root, 'docs/generated/deep/map.md'), 'utf8')).toBe('# map\n');
  });

  it('writes an absolute path where it points, not under the root', () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'spw-writer-abs-'));
    try {
      const target = join(elsewhere, 'abs.txt');
      new NodeFileWriter(root).write(target, 'absolute');

      expect(readFileSync(target, 'utf8')).toBe('absolute');
      expect(existsSync(join(root, 'abs.txt'))).toBe(false);
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it('replaces an existing file whole rather than appending to it', () => {
    const writer = new NodeFileWriter(root);
    writer.write('a.txt', 'first, and longer');
    writer.write('a.txt', 'second');

    expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('second');
  });

  it('writes UTF-8 verbatim, so a regenerated file compares equal to its generator output', () => {
    new NodeFileWriter(root).write('u.md', '✓ ünïcode\r\nline two\n');

    expect(readFileSync(join(root, 'u.md'), 'utf8')).toBe('✓ ünïcode\r\nline two\n');
  });

  it('pins the root at construction, so a later cwd change cannot redirect writes', () => {
    // A relative root is resolved once. Re-resolving per write would follow a chdir.
    const writer = new NodeFileWriter(relative(process.cwd(), root));
    const before = process.cwd();
    const other = mkdtempSync(join(tmpdir(), 'spw-writer-cwd-'));
    try {
      process.chdir(other);
      writer.write('pinned.txt', 'x');
    } finally {
      process.chdir(before);
    }
    try {
      expect(readFileSync(join(root, 'pinned.txt'), 'utf8')).toBe('x');
      expect(existsSync(join(other, 'pinned.txt'))).toBe(false);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});
