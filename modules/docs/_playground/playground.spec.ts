import { describe, expect, it } from 'vitest';

import { docCounts, docHygiene, docPaths, docPlacement, docSymbols, docsChecks } from '@specwarden/docs';
import {
  CheckOptionsError,
  type ICheck,
  defineConfig,
  errorsOf,
  loadConsumerTree,
  runCheck,
  testContext,
  uncoveredFactories,
} from 'specwarden';

import { BROKEN, CLEAN, COVERED, PROBE } from './repository';

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

/** Each factory as a consumer wires it alone: only what the check cannot know. */
const ALONE: Record<string, () => ICheck> = {
  docPaths: () => docPaths(),
  docSymbols: () => docSymbols({ code: 'src/**/*.ts', suffixes: ['Registry'] }),
  docCounts: () => docCounts({ countableNouns: ['services'] }),
  docPlacement: () => docPlacement({ docs: '**/*_MODULE.md', allowed: [/^src\/[^/]+_MODULE\.md$/] }),
  docHygiene: () => docHygiene(),
};

/** What each check's one planted defect in `BROKEN` must name. */
const NAMES: Record<string, string> = {
  docPaths: 'src/gone.ts',
  docSymbols: 'VanishedRegistry',
  docCounts: '4 services',
  docPlacement: 'THINGS_MODULE.md',
  docHygiene: 'nowhere.md',
};

describe('@specwarden/docs', () => {
  it('exercises every check factory the package publishes', async () => {
    const mod = (await import('@specwarden/docs')) as Record<string, unknown>;

    expect(uncoveredFactories(mod, { covered: COVERED, probe: PROBE })).toEqual([]);
  });

  for (const [factory, build] of Object.entries(ALONE)) {
    it(`${factory}: green over the clean tree, and red over the broken one on exactly its own defect`, async () => {
      const check = build();

      expect(errorsOf(await runCheck(check, { tree: CLEAN })), check.id).toEqual([]);
      const broken = errorsOf(await runCheck(check, { tree: BROKEN }));
      expect(broken, check.id).toHaveLength(1);
      expect(broken[0], check.id).toContain(NAMES[factory]);
    });
  }

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

  it('docsChecks: `tier` and `when` reach every check it builds', () => {
    const checks = docsChecks({
      code: 'src/**/*.ts',
      suffixes: ['Registry'],
      countableNouns: ['services'],
      placement: { allowed: [/.*/] },
      tier: 'heavy',
      when: { ending: ['.md'] },
    });

    expect(checks.map((c) => c.tier)).toEqual(['heavy', 'heavy', 'heavy', 'heavy', 'heavy']);
    expect(checks.map((c) => c.when(['src/a.ts']))).toEqual([false, false, false, false, false]);
  });

  it('every check refuses a corpus that matched nothing, rather than passing over it — docCounts too', async () => {
    // The consumer's commonest silent failure: a `docs` pathspec left pointing at a folder
    // that moved. Each check must say it examined nothing — through the published path,
    // since that is the one a consumer's config reaches.
    const nowhere = 'handbook/**/*.md';
    const checks = [
      docPaths({ docs: nowhere }),
      docSymbols({ docs: nowhere, code: ['src/**/*.ts'], suffixes: ['Registry'] }),
      docCounts({ docs: nowhere, countableNouns: ['services'] }),
      docPlacement({ docs: nowhere, allowed: [/.*/] }),
      docHygiene({ docs: nowhere }),
    ];

    for (const check of checks) {
      const verdict = await runCheck(check, { tree: CLEAN });
      expect(verdict.ok, check.id).toBe(false);
      expect(errorsOf(verdict)[0], check.id).toContain(
        `examined 0 document(s) — \`${nowhere}\` matched nothing to read`,
      );
    }
    // And the code corpus `doc-symbols` compares against.
    const noCode = await runCheck(docSymbols({ code: 'lib/**/*.ts', suffixes: ['Registry'] }), { tree: CLEAN });
    expect(errorsOf(noCode)[0]).toContain('examined 0 code file(s)');
  });

  it('refuses a wrong option by name when the file loads, in every factory', () => {
    const refusals: [() => unknown, string][] = [
      [() => docPaths({ skipDirs: ['docs/'] } as never), '`skipDirs` is not an option of docPaths'],
      [() => docSymbols({ code: [], suffixes: ['Registry'] }), '`code` is empty'],
      [() => docCounts({ countableNouns: [] }), '`countableNouns` is empty'],
      [() => docPlacement({} as never), '`allowed` is required'],
      [() => docHygiene({ renderedSources: [] } as never), '`renderedSources` is not an option of docHygiene'],
      [() => docsChecks({ id: 'docs' } as never), '`id` is not an option of docsChecks'],
    ];

    for (const [build, message] of refusals) {
      expect(build, message).toThrow(CheckOptionsError);
      expect(build, message).toThrow(message);
    }
  });
});

// Wired with no `rule`, a module's check was an orphan the moment a register existed —
// and a preset's checks had nowhere to put one. The module knows what its check enforces.
describe('@specwarden/docs — the rule register, with the rules the checks imply', () => {
  const built = () =>
    docsChecks({
      code: ['src/**/*.ts'],
      suffixes: ['Service'],
      countableNouns: ['services'],
      placement: { allowed: [/.*/] },
    });

  it('every check carries an implied rule owned by the package, and a rule the consumer writes wins', () => {
    for (const check of built()) {
      expect(check.rule, check.id).toEqual(
        expect.objectContaining({ statement: expect.any(String), owner: '@specwarden/docs', implied: true }),
      );
      expect(check.title, check.id).toBe(check.rule?.statement);
    }
    expect(docPaths({ rule: 'ours' }).rule).toEqual({ statement: 'ours' });
  });

  it('the register the engine assembles holds each implied rule, and drops one a register entry replaces', async () => {
    const config = defineConfig({
      autoload: false,
      checks: built(),
      rules: [
        {
          id: 'documented-paths-resolve',
          statement: 'a path in our handbook exists',
          owner: 'docs/HANDBOOK.md',
          enforcement: { enforcedBy: ['doc-paths'] },
        },
      ],
    });
    const tree = await loadConsumerTree(testContext({ tree: {} }).files, '.specwarden', config);
    const byId = new Map(tree.rules.map((r) => [r.id, r]));

    expect(byId.get('documented-paths-resolve')?.owner).toBe('docs/HANDBOOK.md');
    expect(byId.has('doc-paths')).toBe(false);
    for (const id of ['doc-symbols', 'doc-counts', 'doc-placement', 'doc-hygiene']) {
      expect(byId.get(id), id).toMatchObject({ owner: '@specwarden/docs', enforcement: { enforcedBy: [id] } });
    }
  });
});
