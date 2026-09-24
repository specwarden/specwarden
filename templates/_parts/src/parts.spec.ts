import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { removeScratch, scratchTree, specwarden } from '../../../scripts/playgrounds.mjs';

import type { ITemplateContext } from 'specwarden';

import {
  agentDefinitionsPart,
  ciCoverageExamplePart,
  compose,
  docCountsExamplePart,
  docHygienePart,
  docPathsPart,
  docPlacementExamplePart,
  docSymbolsExamplePart,
  envPairingExamplePart,
  perimeterPart,
  planLifecyclePart,
  proxyUpstreamsExamplePart,
  scriptWrappersPart,
  secretScanPart,
  shellScopePart,
  specSourcePart,
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
  'ci-coverage': ciCoverageExamplePart(c),
  'shell-scope': shellScopePart(c),
  'env-pairing': envPairingExamplePart(c),
  'proxy-upstreams': proxyUpstreamsExamplePart(c),
  'plan-lifecycle': planLifecyclePart(c),
  'agent-definitions': agentDefinitionsPart(c),
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
const scratch = mkdtempSync(
  join(dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..', '.tmp-generated-'),
);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const importGenerated = async (name: string, body: string): Promise<Record<string, unknown>> => {
  const abs = join(scratch, name);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
  return (await import(pathToFileURL(abs).href)) as Record<string, unknown>;
};

describe('everything a part writes actually loads', () => {
  it('every live check imports, exports a check, and states the rule it enforces', async () => {
    for (const [part, { files }] of Object.entries(everyPart())) {
      for (const file of files.filter((f) => f.path.endsWith('.check.mjs'))) {
        const mod = await importGenerated(`${part}-${file.path.replace(/\//g, '-')}`, file.body);
        const check = mod.check as { rule?: { statement: string }; title: string } | undefined;
        expect(check, `${part}: ${file.path} exports no check`).toBeDefined();
        // The rule is ON the check, so the two cannot drift; the title defaults to it.
        expect(check?.rule?.statement, `${part}: ${file.path} states no rule`).toBeTruthy();
        expect(check?.title).toBe(check?.rule?.statement);
      }
    }
  });

  it('names no id, no title and no default tier — the file name, the rule and the engine supply them', () => {
    // Each was a line a newcomer read, and a value that could disagree with what the
    // engine derives: an id differing from its file name, a title restating the rule.
    for (const [part, { files }] of Object.entries(everyPart())) {
      for (const file of files.filter((f) => /\.check\.mjs(\.example)?$/.test(f.path))) {
        expect(file.body, `${part}: ${file.path}`).not.toMatch(/^\s+title: '/m);
        expect(file.body, `${part}: ${file.path}`).not.toContain("tier: 'fast'");
        if (file.path.endsWith('.check.mjs')) expect(file.body, `${part}: ${file.path}`).not.toMatch(/^\s+id: '/m);
      }
    }
  });

  it('an example names the id its commented rule names — the pair stays linked whatever the file is saved as', () => {
    for (const [part, { files, rules }] of Object.entries(everyPart())) {
      for (const file of files.filter((f) => f.path.endsWith('.check.mjs.example'))) {
        const id = /^ {2}id: '([^']+)',$/m.exec(file.body)?.[1];
        expect(id, `${part}: ${file.path} names no id`).toBeDefined();
        expect(rules.map((r) => r.id)).toContain(id);
      }
    }
  });

  it("carries a header of a few lines, then the options — the reasoning is the module GUIDE's", () => {
    for (const [part, { files }] of Object.entries(everyPart())) {
      for (const file of files.filter((f) => /\.check\.mjs(\.example)?$/.test(f.path))) {
        const header = file.body
          .slice(0, file.body.indexOf('import '))
          .split('\n')
          .filter((l) => l.startsWith('// '));
        expect(header.length, `${part}: ${file.path} has no header`).toBeGreaterThan(1);
        // The title and at most four lines: what it catches, why, what to change, how to switch it on.
        expect(header.length, `${part}: ${file.path} header`).toBeLessThanOrEqual(5);
      }
    }
  });

  it('every EXAMPLE constructs too — the day it is renamed is the worst day to find out', async () => {
    for (const [part, { files }] of Object.entries(everyPart())) {
      for (const file of files.filter((f) => f.path.endsWith('.check.mjs.example'))) {
        const mod = await importGenerated(
          `${part}-${file.path.replace(/\//g, '-').replace(/\.example$/, '')}`,
          file.body,
        );
        expect(mod.check, `${part}: ${file.path} exports no check`).toBeDefined();
      }
    }
  });

  it('the perimeter and the spec source load, and answer the shape the engine expects', async () => {
    const perimeter = await importGenerated('perimeter.mjs', perimeterPart().files[0].body);
    expect(Array.isArray(perimeter.policies)).toBe(true);
    expect((perimeter.policies as { id: string }[]).map((r) => r.id)).toEqual([
      'no-force-push',
      'no-history-rewrite-of-a-shared-branch',
    ]);

    for (const framework of ['openspec', 'speckit'] as const) {
      const mod = await importGenerated(`spec-source-${framework}.mjs`, specSourcePart(framework).files[0].body);
      const source = mod.source as {
        name: string;
        requirements: (f: unknown) => unknown;
        tasks: (f: unknown) => unknown;
      };
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
          .filter((f) => /\.check\.mjs(\.example)?$/.test(f.path))
          .map(
            (f) =>
              f.path
                .split('/')
                .pop()
                ?.replace(/\.check\.mjs(\.example)?$/, '') as string,
          ),
      );
      for (const rule of part.rules) {
        const ids = (rule.enforcement as { enforcedBy?: readonly string[] }).enforcedBy ?? [];
        for (const id of ids) {
          // The perimeter's enforcers are its own rule ids, evaluated by a hook rather
          // than by a run — the engine reads them from perimeter.mjs itself.
          if (name === 'perimeter') continue;
          expect(written.has(id), `${name}: rule ${rule.id} names ${id}, which it does not write`).toBe(true);
        }
      }
    }
  });

  it('an example declares its rule, naming its own check — init writes it commented out beside the others', () => {
    // Declared nowhere, the rule an example enforces lived nowhere the repository could read.
    for (const name of [
      'doc-counts',
      'doc-symbols',
      'doc-placement',
      'env-pairing',
      'proxy-upstreams',
      'ci-coverage',
    ]) {
      const { files, rules } = everyPart()[name];
      const id = files[0].path
        .split('/')
        .pop()
        ?.replace(/\.check\.mjs\.example$/, '');
      expect(
        rules.map((r) => [r.id, r.enforcement]),
        name,
      ).toEqual([[id, { enforcedBy: [id] }]]);
      expect(files[0].body, `${name} does not say how to switch it on`).toContain(
        `rename to ${id}.check.mjs AND uncomment its rule in rules.mjs`,
      );
    }
  });

  it('a live check puts nothing in the register — its rule is on the check', () => {
    for (const name of [
      'secret-scan',
      'doc-paths',
      'doc-hygiene',
      'script-wrappers',
      'shell-scope',
      'plan-lifecycle',
      'agent-definitions',
    ]) {
      expect(everyPart()[name].rules, name).toEqual([]);
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
    expect(ciCoverageExamplePart(ctx({ ci: undefined })).files).toEqual([]);
    expect(ciCoverageExamplePart(ctx({ ci: 'gitlab' })).files).toEqual([]);
  });

  it('no compose file, no env-file check — there would be nothing to reconcile', () => {
    expect(envPairingExamplePart(ctx({ composeFiles: [] })).files).toEqual([]);
  });

  it('no lint or test script, no wrapper — it would fail for a reason that is not the code', () => {
    expect(scriptWrappersPart(ctx({ scripts: [] })).files).toEqual([]);
    expect(scriptWrappersPart(ctx({ scripts: [] })).rules).toEqual([]);
    expect(scriptWrappersPart(ctx({ scripts: ['lint'] })).files.map((f) => f.path)).toEqual([
      'checks/workspace/lint.check.mjs',
    ]);
  });

  it('and each wrapper carries its own rule, so no rule can name a check nobody wrote', () => {
    const { files, rules } = scriptWrappersPart(ctx({ scripts: ['test'] }));
    expect(rules).toEqual([]);
    expect(files.map((f) => f.body.includes("rule: 'Nothing merges while the test suite is red.'"))).toEqual([true]);
  });
});

describe('what the caller decides, the part reads', () => {
  it('uses the documentation glob it was given', () => {
    expect(docPathsPart(ctx({ docs: 'handbook/**/*.md' })).files[0].body).toContain("docs: 'handbook/**/*.md'");
  });

  it('reads every document, and skips a tree of history, where the template says so', () => {
    const body = docPathsPart(ctx(), { docs: '**/*.md', except: ['docs/_plans-archive/'] }).files[0].body;
    expect(body).toContain("docs: '**/*.md'");
    expect(body).toContain("except: ['docs/_plans-archive/']");
    expect(docPathsPart(ctx()).files[0].body).not.toContain('except:');
  });

  it('uses the tier it was given, and writes none where it is the default', () => {
    for (const part of Object.values(everyPart(ctx({ tier: 'pre-commit' })))) {
      for (const f of part.files.filter((x) => /\.check\.mjs(\.example)?$/.test(x.path))) {
        // The wrappers state `heavy` themselves; every other check takes the tier it is handed.
        if (!f.body.includes("tier: 'heavy'")) expect(f.body, f.path).toContain("tier: 'pre-commit'");
      }
    }
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
    expect(agentDefinitionsPart(ctx(), { agentsDir: '.cursor/rules' }).files[0].body).toContain(".cursor/rules'");
    expect(planLifecyclePart(ctx(), { plansDir: 'plans', archiveDir: 'plans/done' }).files[0].body).toContain(
      "plansDir: 'plans'",
    );
  });

  it('names the compose file that was actually found', () => {
    expect(envPairingExamplePart(ctx({ composeFiles: ['compose.yaml'] })).files[0].body).toContain(
      "composeFile: 'compose.yaml'",
    );
  });
});

describe('an example points at what init found, and says plainly what to replace where it found nothing', () => {
  const load = async (name: string, body: string) => (await importGenerated(name, body)).check;

  it('ci-coverage reads the workflow that was detected', async () => {
    const found = ciCoverageExamplePart({ ...ctx(), workflows: ['.github/workflows/deploy.yml'] }).files[0].body;
    expect(found).toContain("workflowFile: '.github/workflows/deploy.yml'");
    expect(found).not.toContain('REPLACE: the workflow');
    const guessed = ciCoverageExamplePart(ctx()).files[0].body;
    expect(guessed).toContain('REPLACE: the workflow file CI runs.');
    expect(await load('ci-guessed.check.mjs', guessed)).toBeDefined();
  });

  it('proxy-upstreams reads the proxy config that was detected, and says when it cannot read it', async () => {
    const caddy = proxyUpstreamsExamplePart({ ...ctx(), proxyConfigs: ['deploy/Caddyfile'] }).files[0].body;
    expect(caddy).toContain("fileFor: () => 'deploy/Caddyfile'");
    expect(caddy).not.toContain('not nginx');
    const nginx = proxyUpstreamsExamplePart({ ...ctx(), proxyConfigs: ['deploy/nginx/upstreams.conf'] }).files[0].body;
    expect(nginx).toContain("fileFor: () => 'deploy/nginx/upstreams.conf'");
    expect(nginx).toContain("not nginx's: over this file it finds no upstream and fails");
    const none = proxyUpstreamsExamplePart(ctx()).files[0].body;
    expect(none).toContain('REPLACE: each mode');
    for (const [n, body] of [
      ['caddy', caddy],
      ['nginx', nginx],
      ['none', none],
    ])
      expect(await load(`upstreams-${n}.check.mjs`, body)).toBeDefined();
  });

  it('env-pairing reads the keys from a committed env sample, when there is one', async () => {
    const sampled = envPairingExamplePart({ ...ctx(), envSamples: ['.env.example'] }).files[0].body;
    expect(sampled).toContain("read('.env.example')");
    const none = envPairingExamplePart(ctx()).files[0].body;
    expect(none).toContain('REPLACE: read the keys');
    expect(none).not.toContain('config/env.schema.json');
    expect(await load('env-sampled.check.mjs', sampled)).toBeDefined();
    expect(await load('env-none.check.mjs', none)).toBeDefined();
  });

  it('a list the engine refuses empty ships with a guess that constructs, marked REPLACE', () => {
    // An empty `countableNouns` or `suffixes` is a load error: it matched everything, not
    // nothing — the opposite of what the old examples said ("empty means inert").
    for (const body of [docCountsExamplePart(ctx()).files[0].body, docSymbolsExamplePart(ctx()).files[0].body]) {
      expect(body).toContain('REPLACE');
      expect(body).not.toMatch(/(countableNouns|suffixes): \[\]/);
      expect(body).not.toMatch(/inert|nothing to look for/i);
    }
  });
});

describe('the tree init writes with NO template, proved identical to what the parts it is built from write', () => {
  /**
   * `core` must not depend on any module, plugin or template — so `init`'s own
   * hand-written secret-scan and doc-paths bodies cannot be RENDERED by these parts;
   * they can only be proved textually identical to them, over the real CLI, so a header
   * or a rule edited in one place is caught the day it drifts from the other.
   */
  it('writes the secret-scan and doc-paths bodies byte-identical to secretScanPart and docPathsPart', () => {
    const dir = scratchTree({
      'README.md': '# tiny\n',
      'package.json': JSON.stringify({
        name: 'tiny',
        devDependencies: { '@specwarden/security': '1', '@specwarden/docs': '1' },
      }),
    });
    try {
      const run = specwarden(dir, ['init']);
      expect(run.status, run.stdout + run.stderr).toBe(0);
      const written = (rel: string) => readFileSync(join(dir, '.specwarden', rel), 'utf8');
      // No docs directory in this scratch repository, so `init` falls back to `**/*.md`.
      const c = ctx({ docs: '**/*.md' });
      expect(written('checks/security/secret-scan.check.mjs')).toBe(secretScanPart(c).files[0].body);
      expect(written('checks/docs/doc-paths.check.mjs')).toBe(docPathsPart(c).files[0].body);
    } finally {
      removeScratch(dir);
    }
  });
});

describe('compose', () => {
  it('merges files, rules and config source in order', () => {
    const merged = compose(
      secretScanPart(ctx()),
      docCountsExamplePart(ctx()),
      perimeterPart(),
      specSourcePart('speckit'),
    );
    expect(merged.files.map((f) => f.path)).toEqual([
      'checks/security/secret-scan.check.mjs',
      'checks/docs/doc-counts.check.mjs.example',
      'perimeter.mjs',
      'spec-source.mjs',
    ]);
    expect(merged.rules.map((r) => r.id)).toEqual(['doc-counts', 'no-irreversible-action-without-a-person']);
    expect(merged.configExtras?.imports).toContain('specSource');
  });

  it('the perimeter needs nothing in the config — the engine reads its rule ids as enforcers', () => {
    expect(perimeterPart().configExtras).toBeUndefined();
  });

  it('has no config source at all when no part contributed one', () => {
    expect(compose(secretScanPart(ctx())).configExtras).toBeUndefined();
  });

  it('refuses two parts writing one path — a merge would silently drop one configuration', () => {
    expect(() => compose(docPathsPart(ctx()), docPathsPart(ctx()))).toThrow(/both write checks\/docs\/doc-paths/);
  });
});
