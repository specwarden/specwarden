import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CONFIG_DIR, CONFIG_FILE, findConfig } from './find-config.util';

/**
 * The ROOT this returns is what every port is built on: the file source, the writer,
 * the ratchet store. A root one level off does not fail — it reads a different tree
 * and reports on it — so these pin which directory is answered, not merely that one is.
 */
describe('findConfig', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spw-find-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const put = (rel: string) => {
    const abs = join(dir, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, 'export default {};');
    return abs;
  };

  it('finds the flat config in the starting directory and answers that directory as the root', () => {
    const configPath = put(`${CONFIG_DIR}/${CONFIG_FILE}`);
    expect(findConfig(dir)).toEqual({ configPath, root: dir });
  });

  it('walks up from a nested directory to the repository that holds the config', () => {
    const configPath = put(`${CONFIG_DIR}/${CONFIG_FILE}`);
    const nested = join(dir, 'packages', 'a', 'src');
    mkdirSync(nested, { recursive: true });
    expect(findConfig(nested)).toEqual({ configPath, root: dir });
  });

  it('accepts the folder-per-unit form, where the config sits in its own folder beside its test', () => {
    const configPath = put(`${CONFIG_DIR}/warden/${CONFIG_FILE}`);
    expect(findConfig(dir)).toEqual({ configPath, root: dir });
  });

  it('prefers the flat file when both layouts exist, so a half-finished migration keeps reading the old one', () => {
    const flat = put(`${CONFIG_DIR}/${CONFIG_FILE}`);
    put(`${CONFIG_DIR}/warden/${CONFIG_FILE}`);
    expect(findConfig(dir)?.configPath).toBe(flat);
  });

  it('does not stop at a consumer folder that holds no config — an empty .specwarden is not a repository root', () => {
    // A nested package with its own `.specwarden/` for ratchets, and no config, must
    // not become the root: every check would then read the package, not the repository.
    const configPath = put(`${CONFIG_DIR}/${CONFIG_FILE}`);
    const pkg = join(dir, 'pkg');
    mkdirSync(join(pkg, CONFIG_DIR, 'ratchets'), { recursive: true });
    expect(findConfig(pkg)).toEqual({ configPath, root: dir });
  });

  it('answers undefined, rather than looping, once it reaches the top of the filesystem', () => {
    // No config anywhere above a fresh temp directory: the walk must terminate at the
    // filesystem root. Were it to loop, this test would time out instead of failing.
    expect(findConfig(dir)).toBeUndefined();
  });
});
