import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { declarationCandidates, resolveDeclaration } from './resolve-declaration.util';

/**
 * Resolution reads the real filesystem, so these run against a temp tree — the whole
 * question is which of two paths is on disk.
 */
describe('declarationCandidates', () => {
  it('offers the flat path first and the folder-per-unit path second', () => {
    expect(declarationCandidates('/z', 'perimeter.mjs')).toEqual([
      join('/z', 'perimeter.mjs'),
      join('/z', 'perimeter', 'perimeter.mjs'),
    ]);
  });

  it('names the folder for the stem, so every dotted concern of one unit shares it', () => {
    // `warden.config.mjs` is ONE unit with a concern, not a unit called `warden.config`:
    // the folder is `warden/`, exactly as `x.service.ts` folders under `x/`.
    expect(declarationCandidates('/z', 'warden.config.mjs')[1]).toBe(join('/z', 'warden', 'warden.config.mjs'));
    expect(declarationCandidates('/z', 'dependency-pins.check.mjs')[1]).toBe(
      join('/z', 'dependency-pins', 'dependency-pins.check.mjs'),
    );
  });

  it('offers nothing but the flat path for a file with no extension at all', () => {
    // There is no stem to name a folder after that is not the file's own name, and a
    // `perimeter/perimeter` folder-and-file of the same name cannot both exist.
    expect(declarationCandidates('/z', 'perimeter')).toEqual([join('/z', 'perimeter')]);
  });
});

describe('resolveDeclaration', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spw-declaration-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const write = (rel: string) => {
    const full = join(dir, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, 'export const rules = [];\n');
    return full;
  };

  it('finds the flat declaration the engine scaffolds', () => {
    const flat = write('perimeter.mjs');
    expect(resolveDeclaration(dir, 'perimeter.mjs')).toBe(flat);
  });

  it('finds the declaration in its own folder, beside the test that put it there', () => {
    const foldered = write(join('perimeter', 'perimeter.mjs'));
    write(join('perimeter', 'perimeter.test.mjs'));
    expect(resolveDeclaration(dir, 'perimeter.mjs')).toBe(foldered);
  });

  it('prefers the flat form while a consumer holds both mid-migration', () => {
    const flat = write('perimeter.mjs');
    write(join('perimeter', 'perimeter.mjs'));
    expect(resolveDeclaration(dir, 'perimeter.mjs')).toBe(flat);
  });

  it('a folder with the right name but no declaration inside it resolves to nothing', () => {
    // The trap this closes: an empty unit folder reads like adoption and would make the
    // caller fail open on a perimeter it thinks it loaded.
    mkdirSync(join(dir, 'perimeter'), { recursive: true });
    expect(resolveDeclaration(dir, 'perimeter.mjs')).toBeUndefined();
  });

  it('an absent declaration resolves to nothing rather than a path that does not exist', () => {
    expect(resolveDeclaration(dir, 'perimeter.mjs')).toBeUndefined();
  });
});
