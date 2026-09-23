import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';

import type { IPart } from '@specwarden/scaffold-parts';
import type { ITemplateContext } from 'specwarden';

import { openspecTemplate } from './openspec.template';

const ctx = (over: Partial<ITemplateContext> = {}): ITemplateContext => ({
  docs: 'docs/**/*.md',
  tier: 'fast',
  workspaces: [],
  packageManager: 'pnpm',
  scripts: [],
  composeFiles: [],
  specFramework: 'openspec',
  ...over,
});

const paths = (c = ctx()) => openspecTemplate.files(c).map((f) => f.path);
const bodyOf = (path: string, c = ctx()) => openspecTemplate.files(c).find((f) => f.path === path)?.body ?? '';

const scratch = mkdtempSync(
  join(dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..', '..', '.tmp-generated-'),
);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('the seam it exists for', () => {
  it('writes a spec source file, and wires it into the config', () => {
    expect(paths()).toContain('spec-source.mjs');
    expect(openspecTemplate.configExtras?.(ctx()).fields).toContain('specSource');
    expect(openspecTemplate.configExtras?.(ctx()).imports).toContain("from './spec-source.mjs'");
  });

  it('the source loads and answers both halves of ISpecSource', async () => {
    const abs = join(scratch, 'spec-source.mjs');
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, bodyOf('spec-source.mjs'));
    const mod = (await import(pathToFileURL(abs).href)) as {
      source: { name: string; requirements: (f: unknown) => unknown; tasks: (f: unknown) => unknown };
    };
    expect(mod.source.name).toBe('openspec');
    expect(typeof mod.source.requirements).toBe('function');
    expect(typeof mod.source.tasks).toBe('function');
  });

  it('says, in the file itself, that nothing is ever written back to the spec tool', () => {
    // The ownership boundary is the whole relationship: reading a foreign tool's tree is
    // interop, writing to it is two tools owning one fact.
    expect(bodyOf('spec-source.mjs')).toContain('Nothing here is ever written.');
  });
});

describe('what it does NOT duplicate', () => {
  it('no plan checks — a repository using OpenSpec plans in OpenSpec', () => {
    expect(paths().some((p) => p.includes('plan'))).toBe(false);
  });

  it('no decision-log check either, for the same reason', () => {
    expect(paths().some((p) => p.includes('decision'))).toBe(false);
  });
});

describe('what it adds beside the seam', () => {
  it('a credential scan and documentation paths', () => {
    expect(paths()).toEqual([
      'spec-source.mjs',
      'checks/security/secret-scan.check.mjs',
      'checks/docs/doc-paths.check.mjs',
    ]);
  });

  it('every check it writes states its own rule, so a fresh tree has no orphan', () => {
    for (const f of openspecTemplate.files(ctx()).filter((x) => x.path.endsWith('.check.mjs')))
      expect(f.body, `${f.path} states no rule`).toMatch(/^\s+rule: '/m);
    // Nothing is left for the register: every rule here is stated by the check enforcing it.
    expect(openspecTemplate.rules(ctx())).toEqual([]);
  });

  it('every generated check imports and constructs', async () => {
    for (const file of openspecTemplate.files(ctx()).filter((f) => f.path.endsWith('.check.mjs'))) {
      const abs = join(scratch, file.path.replace(/\//g, '-'));
      writeFileSync(abs, file.body);
      const mod = (await import(pathToFileURL(abs).href)) as { check?: { rule?: { statement: string } } };
      // Named by its file — no `id:` to disagree with it — and owning the rule it enforces.
      expect(file.body).not.toMatch(/^\s+id: '/m);
      expect(mod.check?.rule?.statement, `${file.path} states no rule`).toBeTruthy();
    }
  });
});

describe('the config fragment it hands init', () => {
  it('imports only from a file this tree writes — a fragment importing a missing file breaks the config on load', () => {
    const extras = openspecTemplate.configExtras?.(ctx());
    const imported = [...(extras?.imports ?? '').matchAll(/from '\.\/([^']+)'/g)].map((m) => m[1]);

    expect(imported.length).toBeGreaterThan(0);
    for (const file of imported) expect(openspecTemplate.files(ctx()).map((f) => f.path)).toContain(file);
  });

  it('still hands init a fragment — never undefined — when its parts contribute no config source', async () => {
    // init splices `fields` into the config file it writes; `undefined` there is a config
    // that prints the word "undefined" into itself. The parts this template composes all
    // contribute today, so the fallback is reached through the seam, not by accident.
    vi.resetModules();
    vi.doMock('@specwarden/scaffold-parts', async (original) => {
      const parts: typeof import('@specwarden/scaffold-parts') = await original();
      return {
        ...parts,
        compose: (...args: IPart[]) => ({ ...parts.compose(...args), configExtras: undefined }),
      };
    });
    try {
      const { openspecTemplate: isolated } = await import('./openspec.template');

      expect(isolated.configExtras?.(ctx())).toEqual({ fields: '' });
    } finally {
      vi.doUnmock('@specwarden/scaffold-parts');
      vi.resetModules();
    }
  });
});
