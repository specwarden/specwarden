import { describe, expect, it } from 'vitest';

import { nestjs } from '@specwarden/plugin-nestjs';
import { type ICheck, type IPlugin, errorsOf, runCheck } from 'specwarden';

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

const OPTIONS = {
  modulesRoot: 'src/modules',
  ormPackage: 'drizzle-orm',
  ruleDocument: 'docs/ARCHITECTURE.md',
};

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
function checksOf(plugin: IPlugin): readonly ICheck[] {
  const checks = plugin.checks ?? [];
  if (checks.length === 0) throw new Error(`plugin "${plugin.name}" declares no checks`);
  return checks;
}

describe('@specwarden/plugin-nestjs', () => {
  it('declares its checks, each with an id a consumer can name on the command line', () => {
    const plugin = nestjs(OPTIONS);

    expect(plugin.name).toBe('nestjs');
    // `checks` is optional on the port — a plugin may declare other things — so a
    // plugin that stopped declaring any would read as `undefined` here rather than as
    // an empty list, which is the difference between this failing and this passing.
    expect(plugin.checks?.map((c) => c.id)).toEqual(['nestjs/db-access-through-repositories']);
  });

  it('supplies no port adapter — a plugin that could reach the filesystem is a way round the gating', () => {
    // Asserted here rather than left to the loader's refusal, because the loader's
    // refusal is only ever felt by somebody who already wrote the offending plugin.
    expect(nestjs(OPTIONS)).not.toHaveProperty('files');
    expect(nestjs(OPTIONS)).not.toHaveProperty('ports');
  });

  it('passes a codebase where the query lives behind a repository', async () => {
    const [check] = checksOf(nestjs(OPTIONS));

    expect((await runCheck(check, { tree: CLEAN, tracked })).ok).toBe(true);
  });

  it('fails the service that reaches the ORM directly, and names the file', async () => {
    const [check] = checksOf(nestjs(OPTIONS));

    const verdict = await runCheck(check, { tree: BROKEN, tracked });

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict).join(' ')).toContain('gaps.service.ts');
  });

  it('exempts the repository layer, the entities and the tests, which is what makes the rule livable', async () => {
    const [check] = checksOf(nestjs(OPTIONS));

    const verdict = await runCheck(check, { tree: BROKEN, tracked });
    const errors = errorsOf(verdict).join(' ');

    expect(errors).not.toContain('gap.repository.ts');
    expect(errors).not.toContain('gaps.service.spec.ts');
    expect(errors).not.toContain('gap.entity.ts');
  });

  it('the ratchet is the CONSUMER’s: a tree with existing debt is told what it may keep', async () => {
    // The plugin ships no number. One violation with a ratchet of 1 is tolerated debt;
    // the same tree with a ratchet of 0 is a failure. A plugin asserting a count would be
    // asserting something about a repository it has never seen.
    const [armed] = checksOf(nestjs({ ...OPTIONS, ratchet: 1 }));

    expect((await runCheck(armed, { tree: BROKEN, tracked })).ok).toBe(true);

    const second = { ...BROKEN, 'src/modules/meetings/meetings.service.ts': "import { eq } from 'drizzle-orm';\n" };
    expect((await runCheck(armed, { tree: second, tracked: Object.keys(second) })).ok).toBe(false);
  });

  it('names the host’s own rule document, so a reader can go where the decision lives', async () => {
    const [check] = checksOf(nestjs(OPTIONS));

    expect(check.hint).toContain('docs/ARCHITECTURE.md');
  });
});
