import { describe, expect, it } from 'vitest';

import { CheckOptionsError, type ICheck, errorsOf, runCheck } from 'specwarden';

import { DEFAULT_ALLOWED_FROM, nestjs } from './nestjs.plugin';

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
  const plugin = nestjs({ modulesRoot: 'src/modules', ormPackage: 'drizzle-orm' });

  it('declares itself by name, so a consumer can see which plugin a check came from', () => {
    expect(plugin.name).toBe('nestjs');
  });

  it('declares exactly the checks it documents — no surprise ones', () => {
    expect(plugin.checks?.map((c) => c.id)).toEqual(['nestjs/db-access-through-repositories']);
  });

  it('supplies no port adapter — a plugin that could reach the filesystem would bypass the gating', () => {
    expect('adapters' in plugin).toBe(false);
  });

  /**
   * The option has to REACH the check, and the only way to see that is to run it: a plugin
   * that dropped `modulesRoot` would scan nothing and pass, which is indistinguishable from
   * a clean tree.
   */
  it('forbids the import inside the configured modules root, and only there', async () => {
    const verdict = await runCheck(checkOf({ modulesRoot: 'src/modules', ormPackage: 'drizzle-orm' }), {
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
    const verdict = await runCheck(checkOf({ modulesRoot: 'src/modules', ormPackage: 'drizzle-orm' }), {
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

    expect(DEFAULT_ALLOWED_FROM).toEqual(['**/repositories/**', '**/entities/**', '**/*.entity.ts', '**/*.spec.ts']);
    expect(
      errorsOf(await runCheck(checkOf({ modulesRoot: 'src/modules', ormPackage: 'drizzle-orm' }), { tree })),
    ).toEqual([]);
  });

  it('takes the ratchet id from the consumer rather than shipping a number', () => {
    const check = checkOf({
      modulesRoot: 'src/modules',
      ormPackage: 'drizzle-orm',
      ratchetId: 'nestjs-db-access',
      ratchet: 3,
    });

    expect(check.ratchet).toMatchObject({ id: 'nestjs-db-access' });
  });

  it('names the host rule document in the hint when one is given', () => {
    const check = checkOf({
      modulesRoot: 'src/modules',
      ormPackage: 'drizzle-orm',
      ruleDocument: 'skills/nestjs/SKILL.md',
    });

    expect(check.hint).toContain('skills/nestjs/SKILL.md');
  });

  it('takes a `rule`, so its check is not an orphan in a host that keeps a register', () => {
    const rule = {
      statement: 'a module reaches the database only through a repository',
      owner: 'docs/ARCHITECTURE.md',
    };

    expect(checkOf({ modulesRoot: 'src/modules', ormPackage: 'drizzle-orm', rule }).rule).toEqual(rule);
  });

  it('refuses an option it does not have, and a missing one, by name', () => {
    expect(() => nestjs({ modulesRoot: 'src/modules', ormPackage: 'x', allowFrom: [] } as never)).toThrow(
      CheckOptionsError,
    );
    expect(() => nestjs({ modulesRoot: 'src/modules', ormPackage: 'x', allowFrom: [] } as never)).toThrow(
      '`allowFrom` is not an option of nestjs',
    );
    expect(() => nestjs({ modulesRoot: 'src/modules' } as never)).toThrow('`ormPackage` is required');
  });
});
