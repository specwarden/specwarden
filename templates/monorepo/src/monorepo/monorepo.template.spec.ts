import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { type ICheck, type ITemplateContext, runCheck } from 'specwarden';

import { monorepo } from './monorepo.template';

const ctx = (over: Partial<ITemplateContext> = {}): ITemplateContext => ({
  docs: 'docs/**/*.md',
  tier: 'fast',
  workspaces: ['packages/a'],
  packageManager: 'pnpm',
  scripts: [],
  composeFiles: [],
  ...over,
});

const paths = (c = ctx()) => monorepo.files(c).map((f) => f.path);
const live = (c = ctx()) => monorepo.files(c).filter((f) => f.path.endsWith('.check.mjs'));

/**
 * THE TEST THAT MATTERS. A template emits strings, and a typechecker never reads them —
 * so an option that was renamed in a module leaves the template compiling happily and
 * producing a tree that throws on the first run. This writes the files and IMPORTS them.
 *
 * It found three such breaks the day it was written: `manifests` for what is now four
 * separate inputs, `definitions` for `agentsDir`, and a `forbid` array where the
 * primitive takes one pattern.
 *
 * Written INSIDE the package so the generated imports resolve against its own
 * node_modules — the same resolution a consumer gets.
 */
const scratch = mkdtempSync(
  join(dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..', '..', '.tmp-generated-'),
);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('the generated tree actually loads', () => {
  it('every .check.mjs imports, exports a check, and names the id its file promises', async () => {
    for (const file of live()) {
      const abs = join(scratch, file.path.replace(/\//g, '-'));
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, file.body);

      const mod = (await import(pathToFileURL(abs).href)) as { check?: { id: string }; checks?: { id: string }[] };
      const found = mod.check ? [mod.check] : (mod.checks ?? []);
      expect(found.length, `${file.path} exports no check`).toBeGreaterThan(0);
      const expected = file.path
        .split('/')
        .pop()
        ?.replace(/\.check\.mjs$/, '');
      if (mod.check) expect(mod.check.id).toBe(expected);
    }
  });
});

describe('every example loads the day somebody renames it', () => {
  /**
   * An `.example` is a check nobody has run yet. The whole promise is "fill it in, rename
   * it, and it enforces the rule" — so the day it is renamed must not be the day it is
   * found not to parse. Two of this template's examples did not: each escaped its own
   * template literals once too often and emitted `\`` into the generated file, a syntax
   * error on the first line anybody would reach.
   */
  it('each one, renamed to `.check.mjs`, imports and exports a check with the id its file promises', async () => {
    const examples = monorepo.files(ctx({ ci: 'github' })).filter((f) => f.path.endsWith('.check.mjs.example'));
    expect(examples.map((f) => f.path)).toEqual([
      'checks/workspace/build-order.check.mjs.example',
      'checks/workspace/dependency-pins.check.mjs.example',
      'checks/harness/gate-coverage.check.mjs.example',
    ]);

    for (const file of examples) {
      const abs = join(scratch, `example-${file.path.replace(/\//g, '-').replace(/\.example$/, '')}`);
      writeFileSync(abs, file.body);
      const mod = (await import(pathToFileURL(abs).href)) as { check?: { id: string } };
      expect(mod.check?.id, `${file.path} does not load as a check`).toBe(
        file.path
          .split('/')
          .pop()
          ?.replace(/\.check\.mjs\.example$/, ''),
      );
    }
  });

  it('the dependency-pins example says it is inert until a policy is declared, rather than passing green', async () => {
    // Its policy lists ship empty. Renamed as-is it checks nothing, and a check that
    // checks nothing must say so instead of printing a clean pass.
    const file = monorepo.files(ctx()).find((f) => f.path.includes('dependency-pins'));
    const abs = join(scratch, 'pins-inert.check.mjs');
    writeFileSync(abs, file?.body ?? '');
    const { check } = (await import(pathToFileURL(abs).href)) as { check: ICheck };

    const verdict = await runCheck(check, {
      tree: { 'package.json': JSON.stringify({ dependencies: { react: '^18.0.0' } }) },
    });

    expect(verdict.findings.map((f) => f.message)).toContain('no policy declared yet — this check is inert');
  });

  it('the dependency-pins example, once its policy is filled in, fails a caret on a frozen package', async () => {
    // What "rename it and it enforces" has to mean: the filled-in file goes RED on the
    // exact defect it names, and green once the tree is fixed.
    const file = monorepo.files(ctx()).find((f) => f.path.includes('dependency-pins'));
    const body = (file?.body ?? '').replace('const FROZEN = [];', "const FROZEN = ['react'];");
    expect(body).toContain("const FROZEN = ['react'];");
    const abs = join(scratch, 'pins-filled.check.mjs');
    writeFileSync(abs, body);
    const { check } = (await import(pathToFileURL(abs).href)) as { check: ICheck };

    const caret = await runCheck(check, {
      tree: { 'package.json': JSON.stringify({ dependencies: { react: '^18.0.0' } }) },
    });
    expect(caret.ok).toBe(false);
    expect(caret.findings.map((f) => f.message)).toContain(
      'package.json: react is ^18.0.0 — frozen packages are declared exactly',
    );

    const exact = await runCheck(check, {
      tree: { 'package.json': JSON.stringify({ dependencies: { react: '18.3.1' } }) },
    });
    expect(exact.ok).toBe(true);
  });
});

describe('what a monorepo needs that a single package does not', () => {
  it('checks the lockfile, because a drifted one installs fine here and differently there', () => {
    expect(paths()).toContain('checks/workspace/lockfile.check.mjs');
  });

  it('uses the package manager it detected', () => {
    const body = monorepo.files(ctx({ packageManager: 'yarn' })).find((f) => f.path.includes('lockfile'))?.body ?? '';
    expect(body).toContain('yarn install --frozen-lockfile');
  });

  it('falls back to pnpm when the package manager could not be told — the template is for a pnpm workspace', () => {
    const body =
      monorepo.files(ctx({ packageManager: undefined })).find((f) => f.path.includes('lockfile'))?.body ?? '';
    expect(body).toContain("cmd: 'pnpm install --frozen-lockfile'");
  });

  it('scans for credentials ONCE for the whole workspace, not per package', () => {
    expect(paths().filter((p) => p.includes('secret-scan'))).toHaveLength(1);
  });
});

describe('the two checks it cannot configure honestly ship as examples', () => {
  it('build-order needs four facts about your tooling, so it is not a live check', () => {
    expect(paths()).toContain('checks/workspace/build-order.check.mjs.example');
    expect(paths()).not.toContain('checks/workspace/build-order.check.mjs');
  });

  it('dependency-pins needs a POLICY, which no engine can guess', () => {
    expect(paths()).toContain('checks/workspace/dependency-pins.check.mjs.example');
  });

  it('each example says what to fill in and what happens if it is left half-done', () => {
    for (const f of monorepo.files(ctx()).filter((f) => f.path.endsWith('.example'))) {
      expect(f.body, `${f.path} does not say how to switch it on`).toContain('rename');
      expect(f.body, `${f.path} does not name the live extension`).toContain('.check.mjs`');
    }
  });
});

describe('every live check is named by a rule', () => {
  it('so a fresh tree has no orphan, and no rule points at an example', () => {
    const ids = new Set(
      live().map((f) =>
        f.path
          .split('/')
          .pop()
          ?.replace(/\.check\.mjs$/, ''),
      ),
    );
    const named = new Set(
      monorepo.rules(ctx()).flatMap((r) => (r.enforcement as { checkIds: readonly string[] }).checkIds),
    );
    expect([...named].sort()).toEqual([...ids].sort());
  });
});

describe('what it takes from the repository rather than assuming', () => {
  it('wraps the linter and the suite only where the manifest declares them', () => {
    expect(paths(ctx({ scripts: ['lint', 'test'] }))).toContain('checks/workspace/lint.check.mjs');
    expect(paths(ctx({ scripts: [] })).some((p) => p.includes('workspace/lint'))).toBe(false);
  });

  it('adds the CI-coverage gate where a workflow was detected', () => {
    // A workspace is where a gate list grows fastest, and a gate nobody runs is the
    // failure that looks exactly like a pass — no red anywhere, simply no evidence.
    expect(paths(ctx({ ci: 'github' }))).toContain('checks/harness/gate-coverage.check.mjs.example');
  });

  it('and omits it where there is none, rather than reconciling against an empty file', () => {
    expect(paths(ctx({ ci: undefined })).some((p) => p.includes('gate-coverage'))).toBe(false);
  });

  it('keeps every rule resolvable as the tree grows and shrinks with the repository', () => {
    for (const c of [ctx(), ctx({ ci: 'github', scripts: ['lint', 'test'] }), ctx({ scripts: ['test'] })]) {
      const written = new Set(
        monorepo
          .files(c)
          .filter((f) => f.path.endsWith('.check.mjs'))
          .map((f) =>
            f.path
              .split('/')
              .pop()
              ?.replace(/\.check\.mjs$/, ''),
          ),
      );
      for (const rule of monorepo.rules(c)) {
        for (const id of (rule.enforcement as { checkIds: readonly string[] }).checkIds) {
          expect(written.has(id), `rule ${rule.id} names ${id}, which this tree does not write`).toBe(true);
        }
      }
    }
  });
});
