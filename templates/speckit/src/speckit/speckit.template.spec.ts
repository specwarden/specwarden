import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';

import type { IPart } from '@specwarden/scaffold-parts';
import type { ITemplateContext } from 'specwarden';

import { speckitTemplate } from './speckit.template';

const ctx = (over: Partial<ITemplateContext> = {}): ITemplateContext => ({
  docs: 'docs/**/*.md',
  tier: 'fast',
  workspaces: [],
  packageManager: 'npm',
  scripts: ['lint', 'test'],
  composeFiles: [],
  specFramework: 'speckit',
  ...over,
});

const paths = (c = ctx()) => speckitTemplate.files(c).map((f) => f.path);
const bodyOf = (path: string, c = ctx()) => speckitTemplate.files(c).find((f) => f.path === path)?.body ?? '';

const scratch = mkdtempSync(
  join(dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..', '..', '.tmp-generated-'),
);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('the seam it exists for', () => {
  it('writes a spec source file, and wires it into the config', () => {
    expect(paths()).toContain('spec-source.mjs');
    expect(speckitTemplate.configExtras?.(ctx()).fields).toContain('specSource');
  });

  it('the source loads and reports itself as speckit', async () => {
    const abs = join(scratch, 'spec-source.mjs');
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, bodyOf('spec-source.mjs'));
    const mod = (await import(pathToFileURL(abs).href)) as { source: { name: string } };
    expect(mod.source.name).toBe('speckit');
  });

  it('leaves every path commented rather than pinned, because a layout moves in a minor release', () => {
    expect(bodyOf('spec-source.mjs')).toContain("// featuresDir: 'specs'");
  });
});

describe('the acceptance a feature is checked off against', () => {
  it('wraps the linter and the suite the manifest declares', () => {
    expect(paths()).toContain('checks/workspace/lint.check.mjs');
    expect(paths()).toContain('checks/workspace/unit.check.mjs');
  });

  it('and writes neither when the manifest declares neither', () => {
    expect(paths(ctx({ scripts: [] })).some((p) => p.includes('workspace/'))).toBe(false);
  });

  it('invokes the package manager it detected', () => {
    expect(bodyOf('checks/workspace/lint.check.mjs')).toContain('npm run lint');
  });
});

describe('rules', () => {
  it('every live check states its own rule, so no rule can name a check that is not written', () => {
    for (const f of speckitTemplate.files(ctx()).filter((x) => x.path.endsWith('.check.mjs')))
      expect(f.body, `${f.path} states no rule`).toMatch(/^\s+rule: '/m);
    // Nothing is left for the register: every rule here is stated by the check enforcing it.
    expect(speckitTemplate.rules(ctx())).toEqual([]);
  });

  it('every generated check imports and constructs', async () => {
    for (const file of speckitTemplate.files(ctx()).filter((f) => f.path.endsWith('.check.mjs'))) {
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
    const extras = speckitTemplate.configExtras?.(ctx());
    const imported = [...(extras?.imports ?? '').matchAll(/from '\.\/([^']+)'/g)].map((m) => m[1]);

    expect(imported.length).toBeGreaterThan(0);
    for (const file of imported) expect(speckitTemplate.files(ctx()).map((f) => f.path)).toContain(file);
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
      const { speckitTemplate: isolated } = await import('./speckit.template');

      expect(isolated.configExtras?.(ctx())).toEqual({ fields: '' });
    } finally {
      vi.doUnmock('@specwarden/scaffold-parts');
      vi.resetModules();
    }
  });
});
