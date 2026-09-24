import { describe, expect, it } from 'vitest';

import { nestjs } from '@specwarden/plugin-nestjs';
import { CheckOptionsError, type ICheck, type IPlugin, errorsOf, runCheck, uncoveredFactories } from 'specwarden';

/**
 * Everything this package publishes, wired the way a consumer wires it.
 *
 * A PLUGIN is wired differently from a module, and that difference is the whole reason
 * this playground exists next to the unit suite. A consumer does not import a check from
 * here — it puts the plugin in `plugins: [...]` and the engine takes the checks out of
 * it. So what is exercised below is the plugin's own contract: it declares checks, every
 * one of them carries an id a consumer can name on the command line, and it supplies no
 * port adapter, because a plugin that could reach the filesystem itself would be a way
 * around the capability gating that makes a check safe to install at all.
 *
 * Each check is then run over a tree twice — one that draws the layer and one that does
 * not. A check returning the same verdict for both cannot fail, and one that cannot fail
 * reports success.
 */

/** The minimal wiring: the two facts the plugin cannot know, and nothing else. */
const OPTIONS = { modulesDir: 'src/modules', ormPackage: 'drizzle-orm' };

/** A codebase where the query lives in the repository layer, as the rule intends. */
const CLEAN: Record<string, string> = {
  'src/modules/gaps/gaps.service.ts': "import { GapRepository } from './repositories/gap.repository';\n",
  'src/modules/gaps/repositories/gap.repository.ts': "import { eq } from 'drizzle-orm';\n",
  'src/modules/gaps/gaps.service.spec.ts': "import { eq } from 'drizzle-orm';\n",
  // An entity IS the ORM's schema: it cannot be written without importing the ORM.
  'src/modules/gaps/entities/gap.entity.ts': "import { pgTable } from 'drizzle-orm/pg-core';\n",
};

/** The same codebase with the query pulled up into the service. */
const BROKEN: Record<string, string> = {
  ...CLEAN,
  'src/modules/gaps/gaps.service.ts': "import { eq } from 'drizzle-orm';\n",
};

const tracked = Object.keys(BROKEN);

/**
 * The checks a plugin declares, refusing an empty declaration.
 *
 * `checks` is OPTIONAL on the port, so a plugin that stopped declaring any would hand
 * back `undefined` and every destructure below would read as "the check has no options"
 * rather than "there is no check" — a whole plugin silently contributing nothing, which
 * the engine has no way to notice either.
 */
function checkOf(plugin: IPlugin): ICheck {
  const [check] = plugin.checks ?? [];
  if (!check) throw new Error(`plugin "${plugin.name}" declares no checks`);
  return check;
}

describe('@specwarden/plugin-nestjs', () => {
  it('exercises every factory the package publishes', async () => {
    const mod = (await import('@specwarden/plugin-nestjs')) as Record<string, unknown>;

    expect(uncoveredFactories(mod, { covered: ['nestjs'], probe: OPTIONS })).toEqual([]);
  });

  it('declares its check under an id a consumer can name on the command line — one with no slash', () => {
    const plugin = nestjs(OPTIONS);

    expect(plugin.name).toBe('nestjs');
    // It was `nestjs/db-access-through-repositories`: the only id in the product with a
    // slash, read by every tool as a path.
    expect(plugin.checks?.map((c) => c.id)).toEqual(['nestjs-db-access']);
  });

  it('supplies no port adapter — a plugin that could reach the filesystem is a way round the gating', () => {
    // Asserted here rather than left to the loader's refusal, because the loader's
    // refusal is only ever felt by somebody who already wrote the offending plugin.
    expect(nestjs(OPTIONS)).not.toHaveProperty('files');
    expect(nestjs(OPTIONS)).not.toHaveProperty('ports');
  });

  it('passes a codebase where the query lives behind a repository, saying what it examined', async () => {
    const verdict = await runCheck(checkOf(nestjs(OPTIONS)), { tree: CLEAN, tracked });

    expect(verdict.ok).toBe(true);
    expect(verdict.findings.map((f) => f.message)).toEqual(['✓ nestjs-db-access — 1 file(s) examined, clean']);
  });

  it('fails the service that reaches the ORM directly, and names the file', async () => {
    const verdict = await runCheck(checkOf(nestjs(OPTIONS)), { tree: BROKEN, tracked });

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict).join(' ')).toContain('gaps.service.ts');
    expect(verdict.findings.find((f) => f.severity === 'error')).toMatchObject({
      file: 'src/modules/gaps/gaps.service.ts',
      line: 1,
    });
  });

  it('exempts the repository layer, the entities and the tests, which is what makes the rule livable', async () => {
    const verdict = await runCheck(checkOf(nestjs(OPTIONS)), { tree: BROKEN, tracked });
    const errors = errorsOf(verdict).join(' ');

    expect(errors).not.toContain('gap.repository.ts');
    expect(errors).not.toContain('gaps.service.spec.ts');
    expect(errors).not.toContain('gap.entity.ts');
  });

  it('a `modulesDir` that matches nothing fails on the corpus floor — unless declared', async () => {
    const moved = checkOf(nestjs({ ...OPTIONS, modulesDir: 'apps/api/src/modules' }));
    const verdict = await runCheck(moved, { tree: CLEAN, tracked });

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)[0]).toContain('`apps/api/src/modules/**` matched nothing to scan');
    const declared = checkOf(nestjs({ ...OPTIONS, modulesDir: 'apps/api/src/modules', corpus: { atLeast: 0 } }));
    expect((await runCheck(declared, { tree: CLEAN, tracked })).ok).toBe(true);
  });

  it('the ratchet is the CONSUMER’s: a tree with existing debt is told what it may keep', async () => {
    // The plugin ships no number. One violation with a ratchet of 1 is tolerated debt;
    // the same tree with a ratchet of 0 is a failure. A plugin asserting a count would be
    // asserting something about a repository it has never seen.
    const armed = checkOf(nestjs({ ...OPTIONS, ratchet: 1 }));

    expect((await runCheck(armed, { tree: BROKEN, tracked })).ok).toBe(true);

    const second = { ...BROKEN, 'src/modules/meetings/meetings.service.ts': "import { eq } from 'drizzle-orm';\n" };
    expect((await runCheck(armed, { tree: second, tracked: Object.keys(second) })).ok).toBe(false);
  });

  it('honours the declaration any module check takes — `id`, `tier`, `when`', () => {
    // Each was accepted and dropped: a `tier: 'heavy'` ran in `fast`, a `when` never filtered.
    const check = checkOf(
      nestjs({ ...OPTIONS, id: 'db-layer', tier: 'heavy', when: (changed) => changed.some((f) => f.endsWith('.ts')) }),
    );

    expect(check.id).toBe('db-layer');
    expect(check.tier).toBe('heavy');
    expect(check.when(['README.md'])).toBe(false);
    expect(check.when(['src/modules/a.ts'])).toBe(true);
  });

  it('refuses an option it does not have, the old spellings, and an empty fact — by name', () => {
    expect(() => nestjs({ ...OPTIONS, allowedFrom: [] } as never)).toThrow(CheckOptionsError);
    expect(() => nestjs({ ...OPTIONS, allowedFrom: [] } as never)).toThrow('`allowedFrom` is not an option of nestjs');
    expect(() => nestjs({ modulesRoot: 'src/modules', ormPackage: 'x' } as never)).toThrow(
      '`modulesRoot` is not an option of nestjs; `modulesDir` is required',
    );
    expect(() => nestjs({ ...OPTIONS, ruleDocument: 'docs/A.md' } as never)).toThrow('`ruleDocument` is not an option');
    expect(() => nestjs({ ...OPTIONS, ormPackage: '' })).toThrow('`ormPackage` is empty');
    expect(() => nestjs({ ...OPTIONS, zone: 'consumer' } as never)).toThrow('`zone` is not an option of nestjs');
  });
});

// Wired with no `rule`, the plugin's check was an orphan the moment a register existed.
describe('@specwarden/plugin-nestjs — its check names the rule it enforces', () => {
  it('carries an implied rule owned by the package, in the product zone, and a rule the consumer writes wins', () => {
    const check = checkOf(nestjs(OPTIONS));

    expect(check.rule).toEqual({
      statement: 'a module reaches the database only through a repository',
      owner: '@specwarden/plugin-nestjs',
      implied: true,
    });
    expect(check.zone).toBe('product');
    expect(check.title).toBe('a module reaches the database only through a repository');
    const ours = checkOf(nestjs({ ...OPTIONS, rule: { statement: 'ours', owner: 'docs/ARCHITECTURE.md' } }));
    expect(ours.rule).toEqual({ statement: 'ours', owner: 'docs/ARCHITECTURE.md' });
    // …and the hint names where the consumer wrote the decision down.
    expect(ours.hint).toContain('Rule: docs/ARCHITECTURE.md.');
  });
});
