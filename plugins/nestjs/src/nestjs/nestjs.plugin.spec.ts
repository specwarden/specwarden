import { describe, expect, it } from 'vitest';

import { InMemoryFileSource } from 'specwarden';

import { nestjs } from './nestjs.plugin';

/**
 * The plugin declares; it does not execute. So what is worth asserting is the DECLARATION —
 * that the check exists, that it is addressed by the id a consumer will see in a failing
 * run, and that the two things the host owns (where its modules are, and what its debt
 * ratchet is called) actually reach the check rather than being dropped on the way.
 *
 * The forbidding itself is the engine's primitive and is tested there. Testing it again
 * here would be a second assertion of one rule.
 */
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
  it('forbids the import inside the configured modules root, and only there', () => {
    const files = new InMemoryFileSource(
      {
        'src/modules/user/user.service.ts': "import { eq } from 'drizzle-orm';",
        'src/other/tool.ts': "import { eq } from 'drizzle-orm';",
      },
      '',
    );

    const verdict = plugin.checks?.[0]?.run({ files } as never);

    expect(verdict?.ok).toBe(false);
    expect(verdict?.findings.map((f) => f.file)).toEqual(['src/modules/user/user.service.ts']);
  });

  it('exempts the repository layer, which is the layer that is supposed to import it', () => {
    const files = new InMemoryFileSource(
      { 'src/modules/user/repositories/user.repository.ts': "import { eq } from 'drizzle-orm';" },
      '',
    );

    expect(plugin.checks?.[0]?.run({ files } as never).ok).toBe(true);
  });

  it('takes the ratchet id from the consumer rather than shipping a number', () => {
    const withDebt = nestjs({
      modulesRoot: 'src/modules',
      ormPackage: 'drizzle-orm',
      ratchetId: 'nestjs-db-access',
      ratchet: 3,
    });

    expect(withDebt.checks?.[0]?.ratchet).toMatchObject({ id: 'nestjs-db-access' });
  });

  it('names the host rule document in the hint when one is given', () => {
    const documented = nestjs({
      modulesRoot: 'src/modules',
      ormPackage: 'drizzle-orm',
      ruleDocument: 'skills/nestjs/SKILL.md',
    });

    expect(documented.checks?.[0]?.hint).toContain('skills/nestjs/SKILL.md');
  });
});
