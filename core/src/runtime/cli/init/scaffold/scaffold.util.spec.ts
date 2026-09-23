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

  it("writes each switched-off example's rule commented out — inert until uncommented, then exactly the rule", async () => {
    // Live, it names a check nobody registered and fails enforcement-resolves on the tree
    // just written; left out, renaming the example meets a red orphan-check nobody mentioned.
    const rule = {
      id: 'doc-counts',
      statement: "A count's source is the repository.",
      owner: 'x.mjs',
      enforcement: { checkIds: ['doc-counts'] },
    };
    const source = renderRules([], [rule]);
    expect(await load(source)).toEqual([]);
    const line = source.split('\n').find((l) => l.includes("id: 'doc-counts'")) ?? '';
    expect(await load(source.replace(line, line.replace('  // ', '  ')))).toEqual([rule]);
  });

  it("keeps a template rule's wording exactly, apostrophes included", async () => {
    const statement = "A migration's down step is never empty.";
    const [r] = await load(renderRules([{ id: 'x', statement, owner: 'O.md', enforcement: { checkIds: ['c'] } }]));
    expect(r).toEqual({ id: 'x', statement, owner: 'O.md', enforcement: { checkIds: ['c'] } });
  });

  it('keeps a statement carrying a backslash or a line break, instead of emitting a file that does not parse', async () => {
    // `quote` escaped the apostrophe and nothing else. A backslash then either vanished
    // or — for `\x`, `\u` — made the generated file a SyntaxError on the first run.
    const statement = 'Paths are written C:\\x\\y, never\nwith a trailing slash.';
    const [r] = await load(renderRules([{ id: 'x', statement, owner: 'O.md', enforcement: { checkIds: ['c'] } }]));
    expect(r.statement).toBe(statement);
  });

  it('keeps a template rule declared not-mechanizable, WITH its reason', async () => {
    // It was rendered as `checkIds: []`, which is a rule that is neither enforced nor
    // excused — exactly what the harness's coverage audit refuses. A template shipping
    // an honest "this cannot be automated" produced a tree that was red on day one.
    const reason = 'Branch protection enforces it, in the forge.';
    const [r] = await load(
      renderRules([{ id: 'reviewed', statement: 's', owner: 'O.md', enforcement: { notMechanizable: reason } }]),
    );
    expect(r.enforcement).toEqual({ notMechanizable: reason });
  });

  it('keeps the commented example of a not-mechanizable rule, so the reader sees the other shape', () => {
    expect(renderRules()).toMatch(/^ {2}\/\/ \{ id: 'reviews-before-merge'.*enforcement: \{ notMechanizable: '/m);
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
  it('puts each module’s check in its family folder, named by its file and stating its rule', () => {
    const files = renderCheckFiles(shape(), availableModules(manifest('@specwarden/security', '@specwarden/docs')));
    expect(files.map((f) => f.path)).toEqual([
      'checks/security/secret-scan.check.mjs',
      'checks/docs/doc-paths.check.mjs',
    ]);
    for (const f of files) {
      expect(f.body).not.toMatch(/^\s+(id|title|tier): '/m);
      expect(f.body).toMatch(/^\s+rule: '/m);
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
  it('names each family written, the checks in it, and the package they come from', () => {
    const readme = renderChecksReadme(renderCheckFiles(shape(), availableModules(manifest('@specwarden/docs'))));
    expect(readme).toContain('| `docs/` | doc-paths | `@specwarden/docs` |');
    expect(readme).not.toContain('(none yet)');
  });

  it('says there are none yet, and what to install, when nothing was written', () => {
    expect(renderChecksReadme([])).toContain('| _(none yet)_ | install a module');
  });

  it('lists the families a template wrote, marking each example as switched off', () => {
    // It printed one placeholder row — "the folders beside this README" — for every template.
    const readme = renderChecksReadme([
      { path: 'checks/docs/doc-paths.check.mjs', body: "import { docPaths } from '@specwarden/docs';" },
      { path: 'checks/docs/doc-counts.check.mjs.example', body: "import { docCounts } from '@specwarden/docs';" },
      { path: 'checks/workspace/lint.check.mjs', body: "import { commandCheck } from 'specwarden';" },
      { path: 'perimeter.mjs', body: "import { commandRule } from 'specwarden';" },
    ]);
    expect(readme).toContain('| `docs/` | doc-paths, doc-counts (example, off) | `@specwarden/docs` |');
    expect(readme).toContain('| `workspace/` | lint | `specwarden` |');
    expect(readme).not.toContain('perimeter');
    expect(readme).not.toContain('the folders beside this README');
  });

  it('shows adding a check WITH its rule — the field whose absence turns the run red', () => {
    const readme = renderChecksReadme([]);
    const example = /```js\n([\s\S]*?)```/.exec(readme)?.[1] ?? '';
    expect(example).toContain("rule: '");
    expect(example).not.toContain('id:');
    expect(readme).toContain('orphan-check');
  });
});

describe('renderReadme', () => {
  it('writes no backticked path with a slash that the scaffold does not create', () => {
    // A doc-paths check reads any backticked slash-bearing path as a claim that the
    // file exists, and this README is scaffolded into trees that write no perimeter.
    const claims = [...renderReadme().matchAll(/`([^`\s]*\/[^`\s]+)`/g)].map((m) => m[1]);
    expect(claims).toEqual([]);
  });

  it('lists only what was written — a perimeter or a spec source where there is one, never a folder nobody wrote', () => {
    const bare = renderReadme();
    for (const absent of ['perimeter.mjs', 'spec-source.mjs', 'relevance.mjs', 'ratchets/', 'baseline/', '.example'])
      expect(bare, absent).not.toContain(absent);
    const agentic = renderReadme([
      { path: 'perimeter.mjs', body: '' },
      { path: 'checks/docs/doc-counts.check.mjs.example', body: '' },
    ]);
    expect(agentic).toMatch(/^ {2}perimeter\.mjs +what an assistant may not do here/m);
    expect(agentic).toContain('uncommenting its rule in rules.mjs');
  });

  it('claims no zone check the tree does not run, and carries no note to the template maintainers', () => {
    // "fails its own zone check" — the consumer's run assembles no zone-boundary without
    // `harness.zone`; and a paragraph on how the README dodges doc-paths was a note to us.
    const readme = renderReadme([{ path: 'perimeter.mjs', body: '' }]);
    expect(readme).not.toMatch(/zone check/i);
    expect(readme).not.toContain('on purpose');
  });
});

describe('the checks README with nothing installed', () => {
  // It said "install a module — `docPaths`, `secretScan` …": factories not in the engine,
  // no package named, and `init` claiming the README listed what to add.
  it('names each module, the install line in this package manager, and the whole file to save', () => {
    const readme = renderChecksReadme([], shape({ packageManager: 'npm', docDirs: ['docs'] }));
    expect(readme).toContain('| _(none yet)_ | see _A module to start from_ below | |');
    expect(readme).toContain('## A module to start from');
    expect(readme).toContain(
      '**`@specwarden/security`** — `npm install --save-dev @specwarden/security`, then save as `security/secret-scan.check.mjs`:',
    );
    expect(readme).toContain("import { docPaths } from '@specwarden/docs';");
    expect(readme).toContain("  docs: 'docs/**/*.md',");
  });

  it('says nothing of starting modules once a check is written', () => {
    const readme = renderChecksReadme(
      renderCheckFiles(shape(), availableModules(manifest('@specwarden/docs'))),
      shape(),
    );
    expect(readme).not.toContain('## A module to start from');
  });
});
