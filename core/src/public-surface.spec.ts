import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The single-export promise. Everything public goes through the root index; the
 * package exposes exactly one entry (`.`). The moment a subpath is exported, the
 * first plugin reaches for an internal and it becomes unremovable — so this pins
 * the surface as one door, and a new export is a deliberate change that fails here
 * first.
 */
describe('public surface', () => {
  const pkg = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'),
  ) as { exports: Record<string, unknown>; main: string; types: string };

  it('exposes exactly the root export', () => {
    expect(Object.keys(pkg.exports)).toEqual(['.']);
  });

  it('points main and types at the built root', () => {
    expect(pkg.main).toBe('./dist/index.js');
    expect(pkg.types).toBe('./dist/index.d.ts');
  });
});
