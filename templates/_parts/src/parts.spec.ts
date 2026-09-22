import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import type { ITemplateContext } from 'specwarden';

import {
  agentRolesPart,
  ciCoveragePart,
  compose,
  docCountsExamplePart,
  docHygienePart,
  docPathsPart,
  docPlacementExamplePart,
  docSymbolsExamplePart,
  envFilesExamplePart,
  perimeterPart,
  planLifecyclePart,
  scriptWrappersPart,
  secretScanPart,
  shellScopePart,
  specSourcePart,
  upstreamsExamplePart,
} from './index';
import type { IPart } from './_shared/part.model';

const ctx = (over: Partial<ITemplateContext> = {}): ITemplateContext => ({
  docs: 'docs/**/*.md',
  tier: 'fast',
  workspaces: [],
  packageManager: 'pnpm',
  scripts: ['lint', 'test'],
  ci: 'github',
  composeFiles: ['docker-compose.yml'],
  hasShellScripts: true,
  ...over,
});

/** Every part, under a context that switches all of them on. */
const everyPart = (c = ctx()): Record<string, IPart> => ({
  'secret-scan': secretScanPart(c),
  'doc-paths': docPathsPart(c),
  'doc-hygiene': docHygienePart(c),
  'doc-counts': docCountsExamplePart(c),
  'doc-symbols': docSymbolsExamplePart(c),
  'doc-placement': docPlacementExamplePart(c),
  'script-wrappers': scriptWrappersPart(c),
  'ci-coverage': ciCoveragePart(c),
  'shell-scope': shellScopePart(c),
  'env-files': envFilesExamplePart(c),
  upstreams: upstreamsExamplePart(c),
  'plan-lifecycle': planLifecyclePart(c),
  'agent-roles': agentRolesPart(c),
  perimeter: perimeterPart(),
  'spec-source': specSourcePart('openspec'),
});

/**
 * THE TEST THAT MATTERS, and the reason this package has one at all.
 *
 * A part emits STRINGS. A typechecker never reads them, so an option renamed in a
 * module leaves every part compiling happily and producing a tree that throws on its
 * first run — the run that decides whether the tool is kept. So this writes what each
 * part emits and IMPORTS it, examples included: an `.example` nobody can import is a
 * file that will fail the day somebody renames it, which is the worst possible day.
 *
 * Written INSIDE the package so the generated imports resolve against its own
 * node_modules — the same resolution a consumer gets.
 */
const scratch = mkdtempSync(join(dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..', '.tmp-generated-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const importGenerated = async (name: string, body: string): Promise<Record<string, unknown>> => {
  const abs = join(scratch, name);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
  return (await import(pathToFileURL(abs).href)) as Record<string, unknown>;
};

describe('everything a part writes actually loads', () => {
  it('every live check imports, exports a check, and names the id its file promises', async () => {
    for (const [part, { files }] of Object.entries(everyPart())) {
      for (const file of files.filter((f) => f.path.endsWith('.check.mjs'))) {
        const mod = await importGenerated(`${part}-${file.path.replace(/\//g, '-')}`, file.body);
        const found = mod.check ? [mod.check] : ((mod.checks as unknown[]) ?? []);
        expect(found.length, `${part}: ${file.path} exports no check`).toBeGreaterThan(0);
        const expected = file.path.split('/').pop()?.replace(/\.check\.mjs$/, '');
        if (mod.check) expect((mod.check as { id: string }).id, `${part}: id does not match its filename`).toBe(expected);
      }
    }
  });

  it('every EXAMPLE constructs too — the day it is renamed is the worst day to find out', async () => {
    for (const [part, { files }] of Object.entries(everyPart())) {
      for (const file of files.filter((f) => f.path.endsWith('.check.mjs.example'))) {
        const mod = await importGenerated(`${part}-${file.path.replace(/\//g, '-').replace(/\.example$/, '')}`, file.body);
        expect(mod.check, `${part}: ${file.path} exports no check`).toBeDefined();
      }
    }
  });

  it('the perimeter and the spec source load, and answer the shape the engine expects', async () => {
    const perimeter = await importGenerated('perimeter.mjs', perimeterPart().files[0].body);
    expect(Array.isArray(perimeter.rules)).toBe(true);
    expect((perimeter.rules as { id: string }[]).map((r) => r.id)).toEqual([
      'no-force-push',
      'no-history-rewrite-of-a-shared-branch',
    ]);

    for (const framework of ['openspec', 'speckit'] as const) {
      const mod = await importGenerated(`spec-source-${framework}.mjs`, specSourcePart(framework).files[0].body);
      const source = mod.source as { name: string; requirements: (f: unknown) => unknown; tasks: (f: unknown) => unknown };
      expect(source.name).toBe(framework);
      expect(typeof source.requirements).toBe('function');
      expect(typeof source.tasks).toBe('function');
    }
  });
});

describe('a rule is carried by the part that needs it', () => {
  it('every rule names only checks the same part writes', () => {
    for (const [name, part] of Object.entries(everyPart())) {
      const written = new Set(
        part.files
          .filter((f) => f.path.endsWith('.check.mjs'))
          .map((f) => f.path.split('/').pop()?.replace(/\.check\.mjs$/, '') as string),
      );
      for (const rule of part.rules) {
        const ids = (rule.enforcement as { checkIds?: readonly string[] }).checkIds ?? [];
        for (const id of ids) {
          // The perimeter's enforcers are its own rule ids, evaluated by a hook rather
          // than by a run — it declares them through configExtras instead.
          if (name === 'perimeter') continue;
          expect(written.has(id), `${name}: rule ${rule.id} names ${id}, which it does not write`).toBe(true);
        }
      }
    }
  });

  it('an example declares NO rule — its file is not loaded until somebody renames it', () => {
    for (const name of ['doc-counts', 'doc-symbols', 'doc-placement', 'env-files', 'upstreams', 'ci-coverage']) {
      expect(everyPart()[name].rules, `${name} declares a rule for a check that is not registered`).toEqual([]);
    }
  });

  it('leaves the owner empty — a part does not know where the caller keeps its README', () => {
    for (const part of Object.values(everyPart())) {
      for (const rule of part.rules) expect(rule.owner).toBe('');
    }
  });
});

describe('a part written blind is a red first run, so each one asks first', () => {
  it('no shell scripts, no shell check — its empty-corpus report is a failure by design', () => {
    expect(shellScopePart(ctx({ hasShellScripts: false })).files).toEqual([]);
  });

  it('no CI workflow, no CI-coverage check — it would reconcile against an empty file and pass', () => {
    expect(ciCoveragePart(ctx({ ci: undefined })).files).toEqual([]);
    expect(ciCoveragePart(ctx({ ci: 'gitlab' })).files).toEqual([]);
  });

  it('no compose file, no env-file check — there would be nothing to reconcile', () => {
    expect(envFilesExamplePart(ctx({ composeFiles: [] })).files).toEqual([]);
  });

  it('no lint or test script, no wrapper — it would fail for a reason that is not the code', () => {
    expect(scriptWrappersPart(ctx({ scripts: [] })).files).toEqual([]);
    expect(scriptWrappersPart(ctx({ scripts: [] })).rules).toEqual([]);
    expect(scriptWrappersPart(ctx({ scripts: ['lint'] })).files.map((f) => f.path)).toEqual(['checks/workspace/lint.check.mjs']);
  });

  it('and the rule shrinks with the files, never naming a check nobody wrote', () => {
    const rules = scriptWrappersPart(ctx({ scripts: ['test'] })).rules;
    expect((rules[0].enforcement as { checkIds: readonly string[] }).checkIds).toEqual(['unit']);
  });
});

describe('what the caller decides, the part reads', () => {
  it('uses the documentation glob it was given', () => {
    expect(docPathsPart(ctx({ docs: 'handbook/**/*.md' })).files[0].body).toContain("docs: 'handbook/**/*.md'");
  });

  it('uses the tier it was given', () => {
    expect(secretScanPart(ctx({ tier: 'pre-commit' })).files[0].body).toContain("tier: 'pre-commit'");
  });

  it('invokes the package manager it detected, and falls back rather than guessing wrong', () => {
    expect(scriptWrappersPart(ctx({ packageManager: 'yarn' })).files[0].body).toContain('yarn run lint');
    expect(scriptWrappersPart(ctx({ packageManager: undefined })).files[0].body).toContain('npm run lint');
  });

  it('takes the caller’s prose, because why a check earns its place differs per repository', () => {
    const body = docPathsPart(ctx(), { header: 'an agent follows them and invents the rest.' }).files[0].body;
    expect(body).toContain('an agent follows them and invents the rest.');
    expect(body).not.toContain('More from the same module');
  });

  it('takes the directories a house actually uses', () => {
    expect(agentRolesPart(ctx(), { agentsDir: '.cursor/rules' }).files[0].body).toContain(".cursor/rules'");
    expect(planLifecyclePart(ctx(), { plansDir: 'plans', archiveDir: 'plans/done' }).files[0].body).toContain("plansDir: 'plans'");
  });

  it('names the compose file that was actually found', () => {
    expect(envFilesExamplePart(ctx({ composeFiles: ['compose.yaml'] })).files[0].body).toContain("composeFile: 'compose.yaml'");
  });
});

describe('compose', () => {
  it('merges files, rules and config source in order', () => {
    const merged = compose(secretScanPart(ctx()), docPathsPart(ctx()), perimeterPart());
    expect(merged.files.map((f) => f.path)).toEqual([
      'checks/security/secret-scan.check.mjs',
      'checks/docs/doc-paths.check.mjs',
      'perimeter.mjs',
    ]);
    expect(merged.rules.map((r) => r.id)).toEqual([
      'no-credentials-in-tree',
      'paths-in-documentation-resolve',
      'no-irreversible-action-without-a-person',
    ]);
    expect(merged.configExtras?.imports).toContain('perimeterRules');
  });

  it('has no config source at all when no part contributed one', () => {
    expect(compose(secretScanPart(ctx())).configExtras).toBeUndefined();
  });

  it('refuses two parts writing one path — a merge would silently drop one configuration', () => {
    expect(() => compose(docPathsPart(ctx()), docPathsPart(ctx()))).toThrow(/both write checks\/docs\/doc-paths/);
  });
});
