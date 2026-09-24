import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import type { ITemplateContext } from 'specwarden';

import { nodeTsTemplate } from './node-ts.template';

const ctx = (over: Partial<ITemplateContext> = {}): ITemplateContext => ({
  docs: 'docs/**/*.md',
  tier: 'fast',
  workspaces: [],
  packageManager: 'pnpm',
  scripts: ['lint', 'test'],
  composeFiles: [],
  ...over,
});

const paths = (c: ITemplateContext) => nodeTsTemplate.files(c).map((f) => f.path);
const bodyOf = (c: ITemplateContext, path: string) => nodeTsTemplate.files(c).find((f) => f.path === path)?.body ?? '';

describe('it emits a tree, not a config', () => {
  it('writes one check file per gate, under a family folder', () => {
    expect(paths(ctx())).toEqual([
      'checks/security/secret-scan.check.mjs',
      'checks/docs/doc-paths.check.mjs',
      'checks/docs/doc-symbols.check.mjs.example',
      'checks/workspace/lint.check.mjs',
      'checks/workspace/unit.check.mjs',
    ]);
  });

  it('every file exports one check and names no id — discovery names it after its file', () => {
    // The convention the engine discovers by: `<id>.check.mjs` exporting one check is
    // that id. An `id:` restating the file name is a second copy that can disagree.
    for (const f of nodeTsTemplate.files(ctx())) {
      // The example names the id its commented rule names, so the two stay linked.
      if (f.path.endsWith('.check.mjs')) expect(f.body).not.toMatch(/^\s+id: '/m);
      else expect(f.body).toContain("  id: 'doc-symbols',");
      expect(f.body).toContain('export const check =');
    }
  });

  it('imports only from the packages it declares it requires', () => {
    const allowed = new Set(['specwarden', ...(nodeTsTemplate.requires as readonly string[])]);
    for (const f of nodeTsTemplate.files(ctx())) {
      for (const [, pkg] of f.body.matchAll(/^import .* from '([^']+)';$/gm)) {
        expect(allowed.has(pkg), `${f.path} imports ${pkg}`).toBe(true);
      }
    }
  });
});

describe('what it leaves out is the deliberate part', () => {
  it('the symbol check is written but NOT registered — it must be told what a symbol looks like here', () => {
    // Live, with a guessed suffix list, it would register a check reporting on names
    // nobody chose. As an `.example` the reader gets the check and the caveat together,
    // which beats the absence: nobody adopts a check they never learned existed.
    expect(paths(ctx())).toContain('checks/docs/doc-symbols.check.mjs.example');
    expect(paths(ctx()).includes('checks/docs/doc-symbols.check.mjs')).toBe(false);
  });

  it('no count check — its vocabulary is English', () => {
    expect(paths(ctx()).some((p) => p.includes('doc-counts'))).toBe(false);
  });

  it('no plan or decision checks — those assume a way of working', () => {
    expect(paths(ctx()).some((p) => p.includes('plan'))).toBe(false);
  });
});

describe('it follows the repository it was pointed at', () => {
  it('uses the documentation glob it was given', () => {
    expect(bodyOf(ctx({ docs: 'handbook/**/*.md' }), 'checks/docs/doc-paths.check.mjs')).toContain(
      "docs: 'handbook/**/*.md'",
    );
  });

  it('uses the tier the repository named', () => {
    expect(bodyOf(ctx({ tier: 'pre-commit' }), 'checks/security/secret-scan.check.mjs')).toContain(
      "tier: 'pre-commit'",
    );
  });

  it('invokes the package manager it detected, and falls back rather than guessing wrong', () => {
    expect(bodyOf(ctx({ packageManager: 'yarn' }), 'checks/workspace/lint.check.mjs')).toContain('yarn run lint');
    expect(bodyOf(ctx({ packageManager: undefined }), 'checks/workspace/lint.check.mjs')).toContain('npm run lint');
  });
});

describe('every generated check carries its rule', () => {
  it('so a fresh tree has no orphan', () => {
    // On the check, owned by its file: a rule in a register far away is a second list
    // kept in step by memory.
    for (const f of nodeTsTemplate.files(ctx()).filter((x) => x.path.endsWith('.check.mjs')))
      expect(f.body, `${f.path} states no rule`).toMatch(/^\s+rule: '/m);
  });

  it("and the register holds only the example's rule, for init to write commented out", () => {
    expect(nodeTsTemplate.rules(ctx()).map((r) => r.id)).toEqual(['doc-symbols']);
  });

  it('and every rule names a check the template actually writes', () => {
    const ids = new Set(
      paths(ctx()).map((p) =>
        p
          .split('/')
          .pop()
          ?.replace(/\.check\.mjs(\.example)?$/, ''),
      ),
    );
    for (const rule of nodeTsTemplate.rules(ctx())) {
      for (const id of (rule.enforcement as { enforcedBy: readonly string[] }).enforcedBy) {
        expect(ids.has(id), `rule ${rule.id} names ${id}, which is not written`).toBe(true);
      }
    }
  });

  it('leaves the owner for init to fill — it knows which file it wrote holds the reasoning', () => {
    for (const rule of nodeTsTemplate.rules(ctx())) expect(rule.owner).toBe('');
  });
});

describe('a wrapper is written only when the script exists', () => {
  it('omits lint and unit when the manifest declares neither', () => {
    // Written blind, they fail on the first run for a reason that has nothing to do
    // with the repository's code — and the first run decides whether the tool is kept.
    expect(paths(ctx({ scripts: [] }))).toEqual([
      'checks/security/secret-scan.check.mjs',
      'checks/docs/doc-paths.check.mjs',
      'checks/docs/doc-symbols.check.mjs.example',
    ]);
  });

  it('writes only the one that exists', () => {
    expect(paths(ctx({ scripts: ['lint'] }))).toContain('checks/workspace/lint.check.mjs');
    expect(paths(ctx({ scripts: ['lint'] }))).not.toContain('checks/workspace/unit.check.mjs');
  });

  it('and each wrapper carries its own rule, so a missing script takes its rule with it', () => {
    const files = nodeTsTemplate.files(ctx({ scripts: ['test'] }));
    expect(files.find((f) => f.path.endsWith('unit.check.mjs'))?.body).toContain(
      "rule: 'Nothing merges while the test suite is red.'",
    );
    expect(nodeTsTemplate.rules(ctx({ scripts: [] })).map((r) => r.id)).toEqual(['doc-symbols']);
  });
});

/**
 * A template emits STRINGS, and a typechecker never reads them: an option renamed in a
 * module leaves the template compiling and the tree throwing on its first run. So every
 * file is written and IMPORTED — examples included, renamed as a consumer would rename
 * them, because the day an example is switched on is the worst day to find it does not parse.
 *
 * Written inside the package so the generated imports resolve as a consumer's would.
 */
const scratch = mkdtempSync(
  join(dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..', '..', '.tmp-generated-'),
);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('the generated tree actually loads', () => {
  it('every live check and every example, renamed, imports and constructs a check', async () => {
    const files = nodeTsTemplate.files(ctx()).filter((f) => /\.check\.mjs(\.example)?$/.test(f.path));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const abs = join(scratch, file.path.replace(/\//g, '-').replace(/\.example$/, ''));
      writeFileSync(abs, file.body);
      const mod = (await import(pathToFileURL(abs).href)) as { check?: { run: unknown } };
      expect(typeof mod.check?.run, `${file.path} does not load as a check`).toBe('function');
    }
  });
});
