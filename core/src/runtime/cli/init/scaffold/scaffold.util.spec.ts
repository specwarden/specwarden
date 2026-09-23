import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IRule } from '../../../../domain';
import { InMemoryFileSource } from '../../../../infrastructure';
import type { IRepoShape } from '../../adopt/detect-repo/detect-repo.util';
import {
  availableModules,
  renderCheckFiles,
  renderChecksReadme,
  renderConfig,
  renderReadme,
  renderRules,
} from './scaffold.util';

const shape = (over: Partial<IRepoShape> = {}): IRepoShape => ({
  workspaces: [],
  hasAgentRouter: false,
  docDirs: [],
  composeFiles: [],
  hasShellScripts: false,
  ...over,
});

const manifest = (...pkgs: string[]) =>
  new InMemoryFileSource({
    'package.json': JSON.stringify({ devDependencies: Object.fromEntries(pkgs.map((p) => [p, '1'])) }),
  });

/**
 * The generated `rules.mjs` is SOURCE a newcomer's first run imports. Reading it with a
 * regex proves it contains a string; importing it proves it is JavaScript and that it
 * says what it was handed — which is the only thing a generator of source can be held to.
 */
describe('renderRules round-trips through the module loader', () => {
  let dir: string;
  let n = 0;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spw-rules-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  async function load(source: string): Promise<IRule[]> {
    const file = join(dir, `rules-${n++}.mjs`);
    writeFileSync(file, source);
    return ((await import(pathToFileURL(file).href)) as { rules: IRule[] }).rules;
  }

  it('with nothing installed, is a module exporting an empty register — audits on, nothing to audit', async () => {
    expect(await load(renderRules())).toEqual([]);
  });

  it('pairs each installed module with the rule its generated check enforces', async () => {
    const rules = await load(renderRules(availableModules(manifest('@specwarden/security', '@specwarden/docs'))));
    expect(rules.map((r) => [r.id, r.enforcement])).toEqual([
      ['no-credentials-in-tree', { checkIds: ['secret-scan'] }],
      ['paths-in-documentation-resolve', { checkIds: ['doc-paths'] }],
    ]);
    for (const r of rules) expect(r.owner).toBe('.specwarden/README.md');
  });

  it("keeps a template rule's wording exactly, apostrophes included", async () => {
    const statement = "A migration's down step is never empty.";
    const [r] = await load(renderRules([], [{ id: 'x', statement, owner: 'O.md', enforcement: { checkIds: ['c'] } }]));
    expect(r).toEqual({ id: 'x', statement, owner: 'O.md', enforcement: { checkIds: ['c'] } });
  });

  it('keeps a statement carrying a backslash or a line break, instead of emitting a file that does not parse', async () => {
    // `quote` escaped the apostrophe and nothing else. A backslash then either vanished
    // or — for `\x`, `\u` — made the generated file a SyntaxError on the first run.
    const statement = 'Paths are written C:\\x\\y, never\nwith a trailing slash.';
    const [r] = await load(renderRules([], [{ id: 'x', statement, owner: 'O.md', enforcement: { checkIds: ['c'] } }]));
    expect(r.statement).toBe(statement);
  });

  it('keeps a template rule declared not-mechanizable, WITH its reason', async () => {
    // It was rendered as `checkIds: []`, which is a rule that is neither enforced nor
    // excused — exactly what the harness's coverage audit refuses. A template shipping
    // an honest "this cannot be automated" produced a tree that was red on day one.
    const reason = 'Branch protection enforces it, in the forge.';
    const [r] = await load(
      renderRules([], [{ id: 'reviewed', statement: 's', owner: 'O.md', enforcement: { notMechanizable: reason } }]),
    );
    expect(r.enforcement).toEqual({ notMechanizable: reason });
  });

  it('keeps the commented example of a not-mechanizable rule, so the reader sees the other shape', () => {
    expect(renderRules()).toContain("//   enforcement: { notMechanizable: '");
  });
});

describe('availableModules reads intent from the manifest', () => {
  it('offers only the modules the manifest declares, in a stable order', () => {
    expect(availableModules(manifest('@specwarden/docs', '@specwarden/security')).map((m) => m.pkg)).toEqual([
      '@specwarden/security',
      '@specwarden/docs',
    ]);
    expect(availableModules(manifest('@specwarden/docs')).map((m) => m.pkg)).toEqual(['@specwarden/docs']);
  });

  it('offers nothing when there is no manifest', () => {
    expect(availableModules(new InMemoryFileSource())).toEqual([]);
  });
});

describe('renderCheckFiles', () => {
  it('puts each module’s check in its family folder, named for the id inside it', () => {
    const files = renderCheckFiles(shape(), availableModules(manifest('@specwarden/security', '@specwarden/docs')));
    expect(files.map((f) => f.path)).toEqual([
      'checks/security/secret-scan.check.mjs',
      'checks/docs/doc-paths.check.mjs',
    ]);
    for (const f of files) {
      const id = f.path.split('/').pop()?.replace('.check.mjs', '');
      expect(f.body).toContain(`id: '${id}'`);
    }
  });

  it('points the doc check at the first documentation directory it detected', () => {
    const [docs] = renderCheckFiles(
      shape({ docDirs: ['doc', 'docs'] }),
      availableModules(manifest('@specwarden/docs')),
    );
    expect(docs.body).toContain("docs: 'doc/**/*.md'");
  });
});

describe('renderConfig', () => {
  it('without extras, imports only the engine and the rules file', () => {
    const src = renderConfig();
    const imports = [...src.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    expect(imports).toEqual(['specwarden', './rules.mjs']);
  });

  it("places a template's imports after the rules import and its fields inside the config object", () => {
    const src = renderConfig({ imports: "import { perimeterRules } from './perimeter.mjs';", fields: '  tiers: [],' });
    expect(src).toContain("import { rules } from './rules.mjs';\nimport { perimeterRules } from './perimeter.mjs';");
    const body = src.slice(src.indexOf('defineConfig({'));
    expect(body.indexOf('  tiers: [],')).toBeGreaterThan(body.indexOf('rules,'));
    expect(body.indexOf('  tiers: [],')).toBeLessThan(body.indexOf('});'));
  });
});

describe('renderChecksReadme', () => {
  it('names each installed family and the package it came from', () => {
    const readme = renderChecksReadme(availableModules(manifest('@specwarden/docs')));
    expect(readme).toContain('| `docs/` | from `@specwarden/docs` |');
    expect(readme).not.toContain('(none yet)');
  });

  it('says there are none yet, and how one appears, when nothing is installed', () => {
    expect(renderChecksReadme([])).toContain('| _(none yet)_ | install a module and its family folder appears here |');
  });

  it('credits the template rather than listing modules when a template wrote the tree', () => {
    const readme = renderChecksReadme(availableModules(manifest('@specwarden/docs')), 'node-ts');
    expect(readme).toContain('from the `node-ts` template');
    expect(readme).not.toContain('`docs/`');
  });
});

describe('renderReadme', () => {
  it('writes no backticked path with a slash that the scaffold does not create', () => {
    // A doc-paths check reads any backticked slash-bearing path as a claim that the
    // file exists, and this README is scaffolded into trees that write no perimeter.
    const claims = [...renderReadme().matchAll(/`([^`\s]*\/[^`\s]+)`/g)].map((m) => m[1]);
    expect(claims).toEqual([]);
  });
});
