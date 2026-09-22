import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import type { ITemplateContext } from 'specwarden';

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
const scratch = mkdtempSync(join(dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..', '..', '.tmp-generated-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('the generated tree actually loads', () => {
  // A template emits strings; a typechecker never reads them. Without this, a renamed
  // module option leaves the template compiling and the tree throwing on its first run.
  it('every .check.mjs imports and exports a check or checks', async () => {
    for (const file of live()) {
      const abs = join(scratch, file.path.replace(/\//g, '-'));
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, file.body);

      const mod = (await import(pathToFileURL(abs).href)) as { check?: { id: string }; checks?: readonly { id: string }[] };
      const found = mod.check ? [mod.check] : [...(mod.checks ?? [])];
      expect(found.length, `${file.path} exports no check`).toBeGreaterThan(0);
      if (mod.check) {
        expect(mod.check.id).toBe(file.path.split('/').pop()?.replace(/\.check\.mjs$/, ''));
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
    const named = new Set(nestjsTemplate.rules(ctx()).flatMap((r) => (r.enforcement as { checkIds: readonly string[] }).checkIds));
    expect(named.has('secret-scan')).toBe(true);
    expect(named.has('nestjs/db-access-through-repositories')).toBe(true);
  });
});
