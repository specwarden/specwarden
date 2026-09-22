import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

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
    expect(bodyOf('spec-source.mjs')).toContain("// root: 'specs'");
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
  it('every live check is named by a rule, and every rule names a check that is written', () => {
    const written = new Set(
      paths()
        .filter((p) => p.endsWith('.check.mjs'))
        .map(
          (p) =>
            p
              .split('/')
              .pop()
              ?.replace(/\.check\.mjs$/, '') as string,
        ),
    );
    const named = new Set(
      speckitTemplate.rules(ctx()).flatMap((r) => (r.enforcement as { checkIds: readonly string[] }).checkIds),
    );
    for (const id of written) expect(named.has(id), `${id} enforces no rule`).toBe(true);
    for (const id of named) expect(written.has(id), `a rule names ${id}, which is not written`).toBe(true);
  });

  it('every generated check imports and constructs', async () => {
    for (const file of speckitTemplate.files(ctx()).filter((f) => f.path.endsWith('.check.mjs'))) {
      const abs = join(scratch, file.path.replace(/\//g, '-'));
      writeFileSync(abs, file.body);
      const mod = (await import(pathToFileURL(abs).href)) as { check?: { id: string } };
      expect(mod.check?.id).toBe(
        file.path
          .split('/')
          .pop()
          ?.replace(/\.check\.mjs$/, ''),
      );
    }
  });
});
