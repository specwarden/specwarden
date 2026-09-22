import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

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
    expect(bodyOf('spec-source.mjs')).toMatch(/never WRITES here/i);
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

  it('every check it writes is named by a rule', () => {
    const live = paths()
      .filter((p) => p.endsWith('.check.mjs'))
      .map(
        (p) =>
          p
            .split('/')
            .pop()
            ?.replace(/\.check\.mjs$/, '') as string,
      );
    const named = new Set(
      openspecTemplate.rules(ctx()).flatMap((r) => (r.enforcement as { checkIds: readonly string[] }).checkIds),
    );
    for (const id of live) expect(named.has(id), `${id} enforces no rule`).toBe(true);
  });

  it('every generated check imports and constructs', async () => {
    for (const file of openspecTemplate.files(ctx()).filter((f) => f.path.endsWith('.check.mjs'))) {
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
