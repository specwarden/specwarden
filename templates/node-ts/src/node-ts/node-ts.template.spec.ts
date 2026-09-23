import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import type { ITemplateContext } from 'specwarden';

import { nodeTs } from './node-ts.template';

const ctx = (over: Partial<ITemplateContext> = {}): ITemplateContext => ({
  docs: 'docs/**/*.md',
  tier: 'fast',
  workspaces: [],
  packageManager: 'pnpm',
  scripts: ['lint', 'test'],
  composeFiles: [],
  ...over,
});

const paths = (c: ITemplateContext) => nodeTs.files(c).map((f) => f.path);
const bodyOf = (c: ITemplateContext, path: string) => nodeTs.files(c).find((f) => f.path === path)?.body ?? '';

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

  it('every file names its check with the id the file name promises', () => {
    // The convention the engine discovers by: `<id>.check.mjs` exports a check whose id
    // is that word. A template that broke it would produce a tree the engine refuses.
    for (const f of nodeTs.files(ctx())) {
      const id = f.path
        .split('/')
        .pop()
        ?.replace(/\.check\.mjs(\.example)?$/, '');
      expect(f.body).toContain(`id: '${id}'`);
      expect(f.body).toContain('export const check =');
    }
  });

  it('imports only from the packages it declares it requires', () => {
    const allowed = new Set(['specwarden', ...(nodeTs.requires as readonly string[])]);
    for (const f of nodeTs.files(ctx())) {
      for (const [, pkg] of f.body.matchAll(/^import .* from '([^']+)';$/gm)) {
        expect(allowed.has(pkg), `${f.path} imports ${pkg}`).toBe(true);
      }
    }
  });
});

describe('what it leaves out is the deliberate part', () => {
  it('the symbol check is written but NOT registered — it must be told what a symbol looks like here', () => {
    // Live, with an empty suffix list, it would register a check that can never fire,
    // and coverage that cannot fail is what this engine exists to refuse. As an
    // `.example` the reader gets the check and the caveat together, which beats the
    // absence: nobody adopts a check they never learned existed.
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

describe('every generated check is named by a rule', () => {
  it('so a fresh tree has no orphan', () => {
    // Examples are excluded: nothing loads them until somebody renames one, and a rule
    // naming an unregistered check fails `enforcement-resolves` on the tree init just
    // wrote — the harness reporting its own scaffold as a defect.
    const ids = paths(ctx())
      .filter((p) => p.endsWith('.check.mjs'))
      .map((p) =>
        p
          .split('/')
          .pop()
          ?.replace(/\.check\.mjs$/, ''),
      );
    const named = new Set(
      nodeTs.rules(ctx()).flatMap((r) => (r.enforcement as { checkIds: readonly string[] }).checkIds),
    );
    for (const id of ids) expect(named.has(id as string), `${id} enforces no rule`).toBe(true);
  });

  it('and every rule names a check the template actually writes', () => {
    const ids = new Set(
      paths(ctx()).map((p) =>
        p
          .split('/')
          .pop()
          ?.replace(/\.check\.mjs$/, ''),
      ),
    );
    for (const rule of nodeTs.rules(ctx())) {
      for (const id of (rule.enforcement as { checkIds: readonly string[] }).checkIds) {
        expect(ids.has(id), `rule ${rule.id} names ${id}, which is not written`).toBe(true);
      }
    }
  });

  it('leaves the owner for the caller to fill — it knows where its README is', () => {
    for (const rule of nodeTs.rules(ctx())) expect(rule.owner).toBe('');
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

  it('and the rule follows, naming only the checks that were written', () => {
    const rules = nodeTs.rules(ctx({ scripts: ['test'] }));
    const suite = rules.find((r) => r.id === 'the-suite-and-the-linter-pass');
    expect((suite?.enforcement as { checkIds: readonly string[] }).checkIds).toEqual(['unit']);
    // ...and disappears entirely when neither exists, so no rule names a missing check
    expect(nodeTs.rules(ctx({ scripts: [] })).some((r) => r.id === 'the-suite-and-the-linter-pass')).toBe(false);
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
  it('every live check and every example, renamed, imports and exports the id its file promises', async () => {
    const files = nodeTs.files(ctx()).filter((f) => /\.check\.mjs(\.example)?$/.test(f.path));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const abs = join(scratch, file.path.replace(/\//g, '-').replace(/\.example$/, ''));
      writeFileSync(abs, file.body);
      const mod = (await import(pathToFileURL(abs).href)) as { check?: { id: string } };
      expect(mod.check?.id, `${file.path} does not load as a check`).toBe(
        file.path
          .split('/')
          .pop()
          ?.replace(/\.check\.mjs(\.example)?$/, ''),
      );
    }
  });
});
