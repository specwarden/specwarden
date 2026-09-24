import { describe, expect, it } from 'vitest';

import { CheckOptionsError, type ICheck, errorsOf, runCheck } from 'specwarden';

import { DEFAULT_NESTJS_EXCEPT, nestjs } from './nestjs.plugin';

/**
 * The plugin declares; it does not execute. So what is worth asserting is the DECLARATION —
 * that the check exists, that it is addressed by the id a consumer will see in a failing
 * run, and that the things the host owns (where its modules are, what its debt ratchet is
 * called, which rule it enforces) actually reach the check rather than being dropped on
 * the way.
 *
 * The forbidding itself is the engine's primitive and is tested there. Testing it again
 * here would be a second assertion of one rule. Each run goes through the engine's own
 * testing kit — a hand-built `{ files }` context worked only while the primitive read
 * exactly the one method the literal defined.
 */
const checkOf = (options: Parameters<typeof nestjs>[0]): ICheck => {
  const [check] = nestjs(options).checks ?? [];
  if (!check) throw new Error('the plugin declared no check');
  return check;
};

describe('nestjs plugin', () => {
  const plugin = nestjs({ modulesDir: 'src/modules', ormPackage: 'drizzle-orm' });

  it('declares itself by name, so a consumer can see which plugin a check came from', () => {
    expect(plugin.name).toBe('nestjs');
  });

  it('declares exactly the checks it documents — no surprise ones', () => {
    expect(plugin.checks?.map((c) => c.id)).toEqual(['nestjs-db-access']);
  });

  it('supplies no port adapter — a plugin that could reach the filesystem would bypass the gating', () => {
    expect('adapters' in plugin).toBe(false);
  });

  /**
   * The option has to REACH the check, and the only way to see that is to run it: a plugin
   * that dropped `modulesDir` would scan nothing and pass, which is indistinguishable from
   * a clean tree.
   */
  it('forbids the import inside the configured modules directory, and only there', async () => {
    const verdict = await runCheck(checkOf({ modulesDir: 'src/modules', ormPackage: 'drizzle-orm' }), {
      tree: {
        'src/modules/user/user.service.ts': "import { eq } from 'drizzle-orm';",
        'src/other/tool.ts': "import { eq } from 'drizzle-orm';",
      },
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.findings.filter((f) => f.severity === 'error').map((f) => f.file)).toEqual([
      'src/modules/user/user.service.ts',
    ]);
  });

  it('exempts the repository layer, which is the layer that is supposed to import it', async () => {
    const verdict = await runCheck(checkOf({ modulesDir: 'src/modules', ormPackage: 'drizzle-orm' }), {
      tree: {
        'src/modules/user/repositories/user.repository.ts': "import { eq } from 'drizzle-orm';",
        // A module file the ban still applies to, so the corpus is not empty — a ban whose
        // every file is exempt is refused, and rightly.
        'src/modules/user/user.service.ts': "import { UserRepository } from './repositories/user.repository';",
      },
    });

    expect(verdict.ok).toBe(true);
  });

  it('exempts the entities by default — an entity IS the ORM’s schema, and must import it', async () => {
    // It did not: every real service was red on its first run, on the entity file.
    const tree = {
      'src/modules/gaps/gaps.service.ts': "import { GapRepository } from './repositories/gap.repository';",
      'src/modules/gaps/entities/gap.table.ts': "import { pgTable } from 'drizzle-orm/pg-core';",
      'src/modules/gaps/gap.entity.ts': "import { Entity } from 'drizzle-orm';",
    };

    expect(DEFAULT_NESTJS_EXCEPT).toEqual(['**/repositories/**', '**/entities/**', '**/*.entity.ts', '**/*.spec.ts']);
    expect(
      errorsOf(await runCheck(checkOf({ modulesDir: 'src/modules', ormPackage: 'drizzle-orm' }), { tree })),
    ).toEqual([]);
  });

  it('takes the ratchet id from the consumer rather than shipping a number', () => {
    const check = checkOf({
      modulesDir: 'src/modules',
      ormPackage: 'drizzle-orm',
      ratchet: { id: 'nestjs-db-access', ceiling: 3 },
    });

    expect(check.ratchet).toMatchObject({ id: 'nestjs-db-access' });
  });

  it('names the owner of the consumer’s rule in the hint — the document the decision lives in', () => {
    // It took a `ruleDocument` beside `rule`: two options for one fact, the rule's owner.
    const check = checkOf({
      modulesDir: 'src/modules',
      ormPackage: 'drizzle-orm',
      rule: { statement: 'queries live in repositories', owner: 'skills/nestjs/SKILL.md' },
    });

    expect(check.hint).toContain('Rule: skills/nestjs/SKILL.md.');
    expect(checkOf({ modulesDir: 'src/modules', ormPackage: 'x', hint: 'ours' }).hint).toBe('ours');
  });

  it('takes a rule written as a statement, and then names no document in the hint', () => {
    const check = checkOf({
      modulesDir: 'src/modules',
      ormPackage: 'drizzle-orm',
      rule: 'queries live in repositories',
    });

    expect(check.rule).toMatchObject({ statement: 'queries live in repositories' });
    expect(check.hint).toBe('Move the query behind a repository, or add the file to `except`.');
  });

  it('carries the rule the package implies when the consumer writes none, in the product zone', () => {
    const check = checkOf({ modulesDir: 'src/modules', ormPackage: 'drizzle-orm' });

    expect(check.rule).toMatchObject({ owner: '@specwarden/plugin-nestjs', implied: true });
    expect(check.zone).toBe('product');
  });

  it('takes `except` as pathspecs, replacing the defaults', async () => {
    const tree = {
      'src/modules/user/user.service.ts': "import { eq } from 'drizzle-orm';",
      'src/modules/user/user.query.ts': "import { eq } from 'drizzle-orm';",
    };
    const check = checkOf({ modulesDir: 'src/modules', ormPackage: 'drizzle-orm', except: ['**/*.query.ts'] });

    expect(errorsOf(await runCheck(check, { tree })).length).toBe(1);
  });

  it('takes a `rule`, so its check is not an orphan in a host that keeps a register', () => {
    const rule = {
      statement: 'a module reaches the database only through a repository',
      owner: 'docs/ARCHITECTURE.md',
    };

    expect(checkOf({ modulesDir: 'src/modules', ormPackage: 'drizzle-orm', rule }).rule).toEqual(rule);
  });

  it('refuses an option it does not have, and a missing one, by name', () => {
    expect(() => nestjs({ modulesDir: 'src/modules', ormPackage: 'x', allowFrom: [] } as never)).toThrow(
      CheckOptionsError,
    );
    expect(() => nestjs({ modulesDir: 'src/modules', ormPackage: 'x', allowFrom: [] } as never)).toThrow(
      '`allowFrom` is not an option of nestjs',
    );
    expect(() => nestjs({ modulesDir: 'src/modules' } as never)).toThrow('`ormPackage` is required');
    expect(() => nestjs({ modulesDir: '', ormPackage: 'x' })).toThrow('`modulesDir` is empty');
  });
});
