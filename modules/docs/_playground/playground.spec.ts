import { describe, expect, it } from 'vitest';

import { docCounts, docHygiene, docPaths, docPlacement, docSymbols } from '@specwarden/docs';
import { errorsOf, runCheck, uncoveredFactories } from 'specwarden';

import { BROKEN, CLEAN, COVERED, PROBE, tracked } from './repository';

/**
 * Everything this package publishes, wired the way a consumer wires it.
 *
 * WHY THIS IS NOT THE UNIT SUITE WITH MORE STEPS. A unit suite imports a unit by PATH,
 * so it keeps passing over a package whose factory was renamed and never re-exported
 * from the barrel — and that is the first thing a consumer meets. This imports
 * `@specwarden/docs` by NAME, through the package's own `exports` map, so it fails where
 * the consumer would.
 *
 * And every check is run TWICE: over a clean tree and a broken one. A check returning
 * the same verdict for both cannot fail, and a check that cannot fail reports success.
 */

const ID = { title: 'playground', tier: 'fast' as const };

describe('@specwarden/docs', () => {
  it('exercises every check factory the package publishes', async () => {
    const mod = (await import('@specwarden/docs')) as Record<string, unknown>;

    expect(uncoveredFactories(mod, { covered: COVERED, probe: PROBE })).toEqual([]);
  });

  it('docPaths: a backticked repository path resolves, or it does not', async () => {
    const check = docPaths({ ...ID, id: 'doc-paths', docs: '**/*.md' });

    expect((await runCheck(check, { tree: CLEAN, tracked: tracked(CLEAN) })).ok).toBe(true);

    const verdict = await runCheck(check, { tree: BROKEN, tracked: tracked(BROKEN) });
    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict).join(' ')).toContain('src/gone.ts');
  });

  it('docSymbols: an identifier named in prose is declared somewhere', async () => {
    const check = docSymbols({
      ...ID,
      id: 'doc-symbols',
      docs: '**/*.md',
      code: ['src/**/*.ts'],
      suffixes: ['Registry'],
    });

    expect((await runCheck(check, { tree: CLEAN, tracked: tracked(CLEAN) })).ok).toBe(true);

    const verdict = await runCheck(check, { tree: BROKEN, tracked: tracked(BROKEN) });
    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict).join(' ')).toContain('VanishedRegistry');
  });

  it('docCounts: an inventory the repository owns is derived, never restated', async () => {
    const check = docCounts({
      ...ID,
      id: 'doc-counts',
      countableNouns: ['services'],
      skipped: [],
      allowlist: () => [],
      countRatchet: 0,
      when: () => true,
    });

    expect((await runCheck(check, { tree: CLEAN, tracked: tracked(CLEAN) })).ok).toBe(true);
    expect((await runCheck(check, { tree: BROKEN, tracked: tracked(BROKEN) })).ok).toBe(false);
  });

  it('docPlacement: a document sits where the contract says its kind lives', async () => {
    const check = docPlacement({
      ...ID,
      id: 'doc-placement',
      docs: '**/*_MODULE.md',
      allowed: [/^src\/[^/]+_MODULE\.md$/],
    });

    expect((await runCheck(check, { tree: CLEAN, tracked: tracked(CLEAN) })).ok).toBe(true);

    const verdict = await runCheck(check, { tree: BROKEN, tracked: tracked(BROKEN) });
    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict).join(' ')).toContain('THINGS_MODULE.md');
  });

  it('docHygiene: a relative link points at something that exists', async () => {
    const check = docHygiene({ ...ID, id: 'doc-hygiene', docs: '**/*.md' });

    expect((await runCheck(check, { tree: CLEAN, tracked: tracked(CLEAN) })).ok).toBe(true);

    const verdict = await runCheck(check, { tree: BROKEN, tracked: tracked(BROKEN) });
    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict).join(' ')).toContain('nowhere.md');
  });
});
