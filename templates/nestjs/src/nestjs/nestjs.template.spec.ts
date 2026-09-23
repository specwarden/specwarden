import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { type ICheck, type ITemplateContext, errorsOf, runCheck } from 'specwarden';

import { nestjsTemplate } from './nestjs.template';

const ctx = (over: Partial<ITemplateContext> = {}): ITemplateContext => ({
  docs: 'docs/**/*.md',
  tier: 'fast',
  workspaces: [],
  scripts: [],
  composeFiles: [],
  ...over,
});

const paths = (c = ctx()) => nestjsTemplate.files(c).map((f) => f.path);
const live = (c = ctx()) => nestjsTemplate.files(c).filter((f) => f.path.endsWith('.check.mjs'));

/** Written inside the package so the generated imports resolve as a consumer's would. */
const scratch = mkdtempSync(
  join(dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..', '..', '.tmp-generated-'),
);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('the generated tree actually loads', () => {
  // A template emits strings; a typechecker never reads them. Without this, a renamed
  // module option leaves the template compiling and the tree throwing on its first run.
  it('every .check.mjs imports and exports a check or checks', async () => {
    for (const file of live()) {
      const abs = join(scratch, file.path.replace(/\//g, '-'));
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, file.body);

      const mod = (await import(pathToFileURL(abs).href)) as {
        check?: { id: string };
        checks?: readonly { id: string }[];
      };
      const found = mod.check ? [mod.check] : [...(mod.checks ?? [])];
      expect(found.length, `${file.path} exports no check`).toBeGreaterThan(0);
      if (mod.check) {
        expect(mod.check.id).toBe(
          file.path
            .split('/')
            .pop()
            ?.replace(/\.check\.mjs$/, ''),
        );
      }
    }
  });

  it('the plugin file exports `checks` (plural) — one plugin yields several', async () => {
    const file = live().find((f) => f.path.includes('nestjs-conventions'));
    const abs = join(scratch, 'plural.check.mjs');
    writeFileSync(abs, file?.body ?? '');
    const mod = (await import(pathToFileURL(abs).href)) as { checks?: readonly { id: string }[] };
    expect(Array.isArray(mod.checks)).toBe(true);
    expect(mod.checks?.length).toBeGreaterThan(0);
  });
});

describe('it wires the plugin with the facts no engine can guess', () => {
  it('names the modules root, the ORM package, and where the convention is written', () => {
    const body = live().find((f) => f.path.includes('nestjs-conventions'))?.body ?? '';
    expect(body).toContain('modulesRoot:');
    expect(body).toContain('ormPackage:');
    expect(body).toContain('ruleDocument:');
  });

  it('starts the ratchet at zero and says it only turns down', () => {
    const body = live().find((f) => f.path.includes('nestjs-conventions'))?.body ?? '';
    expect(body).toContain('ratchet: 0');
    expect(body).toMatch(/only turns DOWN/i);
  });
});

describe('the migration guard is an example, because it is about a PIPELINE', () => {
  it('ships as .example, not as a live check', () => {
    // Whether the old code meets the new schema depends on whether the deploy migrates
    // before or after the container swap — a fact about a pipeline, not about NestJS.
    expect(paths()).toContain('checks/backend/migrations-backwards-compatible.check.mjs.example');
    expect(paths()).not.toContain('checks/backend/migrations-backwards-compatible.check.mjs');
  });

  it('says when it is WRONG for you, not only how to switch it on', () => {
    const body = nestjsTemplate.files(ctx()).find((f) => f.path.endsWith('.example'))?.body ?? '';
    expect(body).toContain('delete it rather than adapting it');
  });
});

describe('every live check is named by a rule', () => {
  it('including the plugin check, addressed by the id the plugin gives it', () => {
    const named = new Set(
      nestjsTemplate.rules(ctx()).flatMap((r) => (r.enforcement as { checkIds: readonly string[] }).checkIds),
    );
    expect(named.has('secret-scan')).toBe(true);
    expect(named.has('nestjs/db-access-through-repositories')).toBe(true);
  });
});

describe('what it asks the repository to install', () => {
  it('requires the ops module ONLY where a compose file made the env-file check worth writing', () => {
    const requires = nestjsTemplate.requires as (c: ITemplateContext) => readonly string[];

    expect(requires(ctx())).toEqual(['@specwarden/plugin-nestjs', '@specwarden/security']);
    expect(requires(ctx({ composeFiles: ['docker-compose.yml'] }))).toEqual([
      '@specwarden/plugin-nestjs',
      '@specwarden/security',
      '@specwarden/ops',
    ]);
  });

  it('writes the env-file example exactly where it requires the module that example imports', () => {
    // A requirement with no file to import it is an install for nothing; a file with no
    // requirement is a tree that throws on its first run.
    for (const c of [ctx(), ctx({ composeFiles: ['compose.yaml'] })]) {
      const requires = (nestjsTemplate.requires as (x: ITemplateContext) => readonly string[])(c);
      const imports = nestjsTemplate.files(c).some((f) => f.body.includes("from '@specwarden/ops'"));
      expect(requires.includes('@specwarden/ops'), `composeFiles=${c.composeFiles.join(',')}`).toBe(imports);
    }
  });
});

describe('every rule resolves to a check this tree writes', () => {
  it('under every context the template reads — no rule names a check that is not registered', async () => {
    for (const c of [ctx(), ctx({ composeFiles: ['docker-compose.yml'], scripts: ['lint', 'test'] })]) {
      const ids = new Set<string>();
      for (const file of live(c)) {
        const abs = join(scratch, `rules-${c.scripts.length}-${file.path.replace(/\//g, '-')}`);
        writeFileSync(abs, file.body);
        const mod = (await import(pathToFileURL(abs).href)) as {
          check?: { id: string };
          checks?: readonly { id: string }[];
        };
        for (const check of mod.check ? [mod.check] : (mod.checks ?? [])) ids.add(check.id);
      }
      for (const rule of nestjsTemplate.rules(c)) {
        for (const id of (rule.enforcement as { checkIds: readonly string[] }).checkIds) {
          expect(ids.has(id), `rule ${rule.id} names ${id}, which this tree does not register`).toBe(true);
        }
      }
    }
  });
});

describe('every example loads the day somebody renames it', () => {
  const examples = (c = ctx({ composeFiles: ['docker-compose.yml'] })) =>
    nestjsTemplate.files(c).filter((f) => f.path.endsWith('.check.mjs.example'));

  const load = async (name: string, body: string): Promise<ICheck> => {
    const abs = join(scratch, name);
    writeFileSync(abs, body);
    return ((await import(pathToFileURL(abs).href)) as { check: ICheck }).check;
  };

  it('each one, renamed to `.check.mjs`, imports and exports a check with the id its file promises', async () => {
    // The migration guard once escaped its own template literals twice and emitted `\``
    // into the file — a syntax error the day anybody switched it on.
    expect(examples().map((f) => f.path)).toEqual([
      'checks/backend/migrations-backwards-compatible.check.mjs.example',
      'checks/ops/env-files-agree.check.mjs.example',
    ]);
    for (const file of examples()) {
      const check = await load(`example-${file.path.replace(/\//g, '-').replace(/\.example$/, '')}`, file.body);
      expect(check.id).toBe(
        file.path
          .split('/')
          .pop()
          ?.replace(/\.check\.mjs\.example$/, ''),
      );
    }
  });

  it('the migration guard, renamed, fails a DROP COLUMN and names what to do instead', async () => {
    const file = examples().find((f) => f.path.includes('migrations'));
    const check = await load('migrations-live.check.mjs', file?.body ?? '');

    const verdict = await runCheck(check, {
      tree: { 'migrations/0042_drop_legacy.sql': 'ALTER TABLE users DROP COLUMN legacy_name;' },
    });

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict).join('\n')).toContain('the old code still selects it — drop it in a later deploy');
  });

  it('the migration guard passes an additive migration, and says how many files it read', async () => {
    const file = examples().find((f) => f.path.includes('migrations'));
    const check = await load('migrations-additive.check.mjs', file?.body ?? '');

    const verdict = await runCheck(check, {
      tree: { 'migrations/0043_add.sql': 'ALTER TABLE users ADD COLUMN x int;' },
    });

    expect(verdict.ok).toBe(true);
    expect(verdict.findings.map((f) => f.message)).toContain('1 migration file(s) read');
  });

  it('the migration guard over no migrations SAYS it read none, rather than a bare pass', async () => {
    const file = examples().find((f) => f.path.includes('migrations'));
    const check = await load('migrations-empty.check.mjs', file?.body ?? '');

    const verdict = await runCheck(check, { tree: { 'src/main.ts': '' } });

    expect(verdict.findings.map((f) => f.message)).toContain('0 migration file(s) read');
  });
});
