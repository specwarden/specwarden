import { describe, expect, it } from 'vitest';

import { docCounts, docHygiene, docPaths, docPlacement, docSymbols, docsChecks } from '@specwarden/docs';
import { CheckOptionsError, errorsOf, runCheck } from 'specwarden';

import { BROKEN, CLEAN, COVERED } from './repository';

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
 *
 * Version control is the kit's own: `runCheck` reports the tree as tracked and filters it
 * by each pathspec the way git does. A matcher written here instead once read the empty
 * pathspec as "nothing" rather than "everything" — the trap that let a credential scan
 * pass over a credential — so there is no second reading to drift.
 */

const ID = { title: 'playground', tier: 'fast' as const };

const isCheck = (value: unknown): boolean =>
  typeof (value as { id?: unknown } | null)?.id === 'string' &&
  typeof (value as { run?: unknown } | null)?.run === 'function';

/**
 * Every export that builds checks, told from a helper by what it DOES with an options
 * object it cannot honour: it returns checks, or it refuses the options by name.
 *
 * Not one probe carrying the union of every factory's options, which is how this was
 * found before. A factory now refuses an option it does not have, so the union read every
 * factory as a helper and the audit passed over none of them — the check that cannot
 * fail, in the suite meant to catch it.
 */
function factoriesOf(mod: Readonly<Record<string, unknown>>): string[] {
  return Object.entries(mod)
    .filter(([name, value]) => typeof value === 'function' && /^[a-z]/.test(name))
    .filter(([, value]) => {
      try {
        const made = (value as (options: unknown) => unknown)({ id: 'probe', unknownOption: true });
        return isCheck(made) || (Array.isArray(made) && made.length > 0 && made.every(isCheck));
      } catch (error) {
        return error instanceof CheckOptionsError;
      }
    })
    .map(([name]) => name)
    .sort();
}

describe('@specwarden/docs', () => {
  it('exercises every check factory the package publishes', async () => {
    const mod = (await import('@specwarden/docs')) as Record<string, unknown>;

    expect(factoriesOf(mod)).toEqual([...COVERED].sort());
  });

  it('docsChecks: the whole module in one call, each check red on its own defect', async () => {
    const checks = docsChecks({
      code: ['src/**/*.ts'],
      suffixes: ['Registry'],
      countableNouns: ['services'],
      placement: { docs: '**/*_MODULE.md', allowed: [/^src\/[^/]+_MODULE\.md$/] },
    });

    expect(checks.map((c) => c.id)).toEqual(['doc-paths', 'doc-symbols', 'doc-counts', 'doc-placement', 'doc-hygiene']);
    for (const check of checks) {
      expect(errorsOf(await runCheck(check, { tree: CLEAN })), check.id).toEqual([]);
      expect(errorsOf(await runCheck(check, { tree: BROKEN })), check.id).toHaveLength(1);
    }
  });

  it('docPaths: a backticked repository path resolves, or it does not', async () => {
    const check = docPaths({ ...ID, id: 'doc-paths', docs: '**/*.md' });

    expect((await runCheck(check, { tree: CLEAN })).ok).toBe(true);

    const verdict = await runCheck(check, { tree: BROKEN });
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

    expect((await runCheck(check, { tree: CLEAN })).ok).toBe(true);

    const verdict = await runCheck(check, { tree: BROKEN });
    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict).join(' ')).toContain('VanishedRegistry');
  });

  it('docCounts: an inventory the repository owns is derived, never restated', async () => {
    // Its nouns are the one thing it asks for: no skipped trees, no allowlist and no
    // relevance predicate are the defaults a new repository has.
    const check = docCounts({ ...ID, id: 'doc-counts', countableNouns: ['services'] });

    expect((await runCheck(check, { tree: CLEAN })).ok).toBe(true);

    const verdict = await runCheck(check, { tree: BROKEN });
    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)).toEqual(['README.md:7  "4 services"  There are 4 services.']);
  });

  it('every documentation check refuses a corpus that matched nothing, rather than passing over it', async () => {
    // The consumer's commonest silent failure: a `docs` pathspec left pointing at a folder
    // that moved. Each check must say it examined nothing — through the published path,
    // since that is the one a consumer's config reaches.
    const nowhere = 'handbook/**/*.md';
    const checks = [
      docPaths({ ...ID, id: 'doc-paths', docs: nowhere }),
      docSymbols({ ...ID, id: 'doc-symbols', docs: nowhere, code: ['src/**/*.ts'], suffixes: ['Registry'] }),
      docPlacement({ ...ID, id: 'doc-placement', docs: nowhere, allowed: [/.*/] }),
      docHygiene({ ...ID, id: 'doc-hygiene', docs: nowhere }),
    ];

    for (const check of checks) {
      const verdict = await runCheck(check, { tree: CLEAN });
      expect(verdict.ok, check.id).toBe(false);
      expect(errorsOf(verdict)[0], check.id).toContain('examined nothing');
    }
  });

  it('docPlacement: a document sits where the contract says its kind lives', async () => {
    const check = docPlacement({
      ...ID,
      id: 'doc-placement',
      docs: '**/*_MODULE.md',
      allowed: [/^src\/[^/]+_MODULE\.md$/],
    });

    expect((await runCheck(check, { tree: CLEAN })).ok).toBe(true);

    const verdict = await runCheck(check, { tree: BROKEN });
    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict).join(' ')).toContain('THINGS_MODULE.md');
  });

  it('docHygiene: a relative link points at something that exists', async () => {
    const check = docHygiene({ ...ID, id: 'doc-hygiene', docs: '**/*.md' });

    expect((await runCheck(check, { tree: CLEAN })).ok).toBe(true);

    const verdict = await runCheck(check, { tree: BROKEN });
    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict).join(' ')).toContain('nowhere.md');
  });
});

// Wired with no `rule`, a module's check was an orphan the moment a register existed —
// and a preset's checks had nowhere to put one. The module knows what its check enforces.
describe('@specwarden/docs — every check names the rule it enforces', () => {
  it('carries an implied rule owned by the package, and a rule the consumer writes wins', () => {
    const built = docsChecks({
      code: ['src/**/*.ts'],
      suffixes: ['Service'],
      countableNouns: ['services'],
      placement: { allowed: [/^docs\//] },
    });
    for (const check of built) {
      expect(check.rule, check.id).toEqual(
        expect.objectContaining({ statement: expect.any(String), owner: '@specwarden/docs', implied: true }),
      );
      expect(check.title, check.id).not.toBe(check.id);
    }
    expect(docPaths({ id: 'doc-paths', rule: 'ours' }).rule).toEqual({ statement: 'ours' });
  });
});
