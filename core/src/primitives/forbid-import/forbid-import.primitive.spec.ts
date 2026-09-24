import { describe, expect, it } from 'vitest';

import { errorsOf, runCheck } from '../../testing';
import { forbidImport, type IForbidImportOptions } from './forbid-import.primitive';

/**
 * Code under A must not import B. The ban is only as good as the import forms it
 * recognises, so the refusing half is pinned across every spelling a module can be
 * loaded by — including the dynamic one that once walked straight through.
 */
const ID = { id: 'no-orm-in-handlers', title: 'handlers do not touch the ORM', tier: 'fast' as const };
const check = (over: Partial<IForbidImportOptions> = {}) =>
  forbidImport({ ...ID, files: 'src/handlers/**', to: 'orm', ...over });

describe('forbidImport — the refusing verdict', () => {
  it('fails on an import of the banned module and says where', async () => {
    const verdict = await runCheck(check(), {
      tree: { 'src/handlers/a.ts': "import { x } from './local';\nimport { sql } from 'orm';\n" },
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.findings).toEqual([
      {
        severity: 'error',
        file: 'src/handlers/a.ts',
        line: 2,
        message: 'src/handlers/a.ts imports `orm`, which is forbidden from src/handlers/**.',
        ruleId: 'no-orm-in-handlers',
      },
    ]);
  });

  it.each([
    ["import 'orm';", 'a side-effect import'],
    ["export * from 'orm';", 'a re-export'],
    ["const orm = require('orm');", 'a require'],
    ["const orm = await import('orm');", 'a dynamic import'],
    ["import { pg } from 'orm/pg-core';", 'a subpath of the banned package'],
  ])('refuses %j — %s', async (source) => {
    const verdict = await runCheck(check(), { tree: { 'src/handlers/a.ts': source } });

    expect(errorsOf(verdict)).toHaveLength(1);
  });

  it('reports each banned import, one finding apiece', async () => {
    const verdict = await runCheck(check(), {
      tree: { 'src/handlers/a.ts': "import 'orm';\nimport 'orm/a';\n", 'src/handlers/b.ts': "import 'orm';\n" },
    });

    expect(verdict.findings.map((f) => `${f.file}:${f.line}`)).toEqual([
      'src/handlers/a.ts:1',
      'src/handlers/a.ts:2',
      'src/handlers/b.ts:1',
    ]);
  });

  it('takes a RegExp target and applies it to every file alike, even when it is global', async () => {
    const verdict = await runCheck(check({ to: /^orm(\/|$)/g }), {
      tree: {
        'src/handlers/a.ts': "import 'orm';",
        'src/handlers/b.ts': "import 'orm';",
        'src/handlers/c.ts': "import 'orm';",
      },
    });

    expect(errorsOf(verdict)).toHaveLength(3);
  });
});

describe('forbidImport — the passing verdict', () => {
  it('passes code that imports something else', async () => {
    const verdict = await runCheck(check(), { tree: { 'src/handlers/a.ts': "import { x } from './local';\n" } });

    expect(verdict.ok).toBe(true);
  });

  it('does not ban a different package that shares the prefix', async () => {
    const verdict = await runCheck(check(), { tree: { 'src/handlers/a.ts': "import 'orm-helpers';\n" } });

    expect(verdict.ok).toBe(true);
  });

  it('applies only under `from` — the same import elsewhere is allowed', async () => {
    const verdict = await runCheck(check(), {
      tree: { 'src/repositories/a.ts': "import 'orm';\n", 'src/handlers/clean.ts': "import './local';\n" },
    });

    expect(verdict.ok).toBe(true);
    expect(errorsOf(verdict)).toEqual([]);
  });

  it('exempts the layer an `except` glob names, and nothing beside it', async () => {
    const verdict = await runCheck(check({ except: ['src/handlers/**/*.spec.ts'] }), {
      tree: { 'src/handlers/a.spec.ts': "import 'orm';", 'src/handlers/a.ts': "import 'orm';" },
    });

    expect(verdict.findings.map((f) => f.file)).toEqual(['src/handlers/a.ts']);
  });

  it('holds at its ratchet and fails one past it; a stored ratchet wins', async () => {
    const tree = { 'src/handlers/a.ts': "import 'orm';\n", 'src/handlers/b.ts': "import 'orm';\n" };

    expect((await runCheck(check({ ratchet: 2 }), { tree })).ok).toBe(true);
    expect((await runCheck(check({ ratchet: 1 }), { tree })).ok).toBe(false);
    expect((await runCheck(check({ ratchet: 1 }), { tree, threshold: 2 })).ok).toBe(true);
  });
});

describe('forbidImport — an empty corpus', () => {
  /**
   * A `from` glob that matches nothing used to pass with no line saying so. The ban on a
   * folder that was renamed away is a ban on nothing, and it is now refused by default.
   */
  it('refuses a `from` that matched no file — the ban guarded nothing, and the import is right there', async () => {
    const verdict = await runCheck(check({ files: 'src/controllers/**' }), {
      tree: { 'src/handlers/a.ts': "import 'orm';" },
    });

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)).toEqual([expect.stringContaining('`src/controllers/**` matched nothing to scan')]);
  });

  it('refuses a `from` whose every file is exempt — an exception that swallows the rule', async () => {
    const verdict = await runCheck(check({ except: ['src/handlers/**'] }), {
      tree: { 'src/handlers/a.ts': "import 'orm';" },
    });

    expect(verdict.ok).toBe(false);
  });

  it('accepts an empty corpus only when the check says so in writing', async () => {
    const verdict = await runCheck(check({ files: 'src/controllers/**', corpus: { atLeast: 0 } }), {
      tree: { 'src/handlers/a.ts': "import 'orm';" },
    });

    expect(verdict.ok).toBe(true);
  });

  it('declares only `read`', () => {
    expect(check().capabilities).toEqual(['read']);
  });
});
