import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileNotFoundError } from '../../domain';
import { NodeFileSource } from './node-file-source.adapter';

/**
 * What only the REAL file source has to get right. The shared contract suite
 * (`_contract/file-source.contract.spec.ts`) holds it to the in-memory source on the
 * questions both answer; these are the ones a constructed tree cannot pose — an
 * absolute path from the platform, a root that is a drive, a link to nothing.
 */
describe('NodeFileSource', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'spw-nfs-'));
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(join(root, 'docs', 'a.md'), 'a\n');
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reports its root forward-slashed, with no platform separator left in it', () => {
    const reported = new NodeFileSource(root).root();

    expect(reported).not.toContain('\\');
    expect(reported).toBe(root.split(sep).join('/'));
  });

  /**
   * A path that arrives from the platform — an editor hook, a stack trace — is
   * absolute. Resolving it against the root a second time would point at
   * `<root>/<root>/…`, and every answer would be "not found".
   */
  it('answers an ABSOLUTE path where it points, and normalises it back to repository-relative', () => {
    const source = new NodeFileSource(root);
    const absolute = join(root, 'docs', 'a.md');

    expect(source.exists(absolute)).toBe(true);
    expect(source.read(absolute)).toBe('a\n');
    expect(source.normalize(absolute)).toBe('docs/a.md');
  });

  it('names a missing file repository-relative in the error, even when asked by absolute path', () => {
    const source = new NodeFileSource(root);

    expect(() => source.read(join(root, 'docs', 'gone.md'))).toThrow(FileNotFoundError);
    expect(() => source.read(join(root, 'docs', 'gone.md'))).toThrow(/docs\/gone\.md/);
    expect(() => source.list(join(root, 'nope'))).toThrow(/nope/);
  });

  /**
   * A path outside the repository has no repository-relative spelling. Inventing one
   * (a `../..` chain, or a truncated suffix) would name a file that is not the one
   * meant; it stays absolute, forward-slashed, so it reads as foreign.
   */
  it('leaves a path outside the root absolute rather than inventing a relative one', () => {
    const outside = join(parse(root).root, 'somewhere-else', 'x.md');
    const normalised = new NodeFileSource(root).normalize(outside);

    expect(normalised).toBe(outside.split(sep).join('/'));
  });

  it('does not treat a sibling that merely SHARES the root prefix as inside it', () => {
    // `/tmp/spw-nfs-abc` must not claim `/tmp/spw-nfs-abcdef/x.md` as `def/x.md`.
    const sibling = `${root}def${sep}x.md`;

    expect(new NodeFileSource(root).normalize(sibling)).toBe(sibling.split(sep).join('/'));
  });

  it('strips exactly one separator when the root already ends in one, as a drive root does', () => {
    // `resolve('C:\\')` keeps its trailing separator; appending another would make every
    // path under a drive root fail the prefix test and stay absolute.
    const driveRoot = parse(root).root;
    const source = new NodeFileSource(driveRoot);

    expect(source.normalize(join(driveRoot, 'a', 'b.md'))).toBe('a/b.md');
  });

  /**
   * `globSync` matches a directory ENTRY, and a dangling link is one: it lists, and it
   * cannot be read. Returned, it would make the next `read` throw inside a check that
   * asked only for files it could read.
   */
  it('drops a glob match that cannot be stat-ed — a link whose target is gone', () => {
    const target = join(root, 'target-dir');
    mkdirSync(target);
    writeFileSync(join(target, 'inner.md'), 'x');
    // A junction needs no privilege on Windows; elsewhere the type is ignored and this
    // is an ordinary directory symlink.
    symlinkSync(target, join(root, 'dangling'), 'junction');
    rmSync(target, { recursive: true, force: true });

    const source = new NodeFileSource(root);

    expect(source.glob('*')).toEqual([]);
    expect(source.glob('**/*.md')).toEqual(['docs/a.md']);
  });
});
