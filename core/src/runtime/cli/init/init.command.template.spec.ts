import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IFileWriter } from '../../../domain';
import { NodeFileSource } from '../../../infrastructure';
import { packageForTemplate } from './load-template/load-template.util';
import { init } from './init.command';

/**
 * `init --template <name>` through a REAL installed package: resolution is by
 * `require.resolve` from the repository, which an in-memory tree cannot answer. The
 * writer stays in memory so every assertion reads exactly what init chose to write.
 */
describe('init --template', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'spw-init-tpl-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const manifest = (body: object) => writeFileSync(join(root, 'package.json'), JSON.stringify(body));

  /** A template whose first file is the context it was handed, so a test can read it. */
  const install = (name: string, members: string) => {
    const dir = join(root, 'node_modules', packageForTemplate(name));
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: packageForTemplate(name), type: 'module', main: 'i.mjs' }),
    );
    writeFileSync(join(dir, 'i.mjs'), `export const template = { name: '${name}', describe: 'd', ${members} };`);
  };

  const STANDARD = `
    requires: [],
    files: (ctx) => [
      { path: 'checks/meta/context.check.mjs', body: JSON.stringify(ctx) },
      { path: 'checks/ops/compose.check.mjs.example', body: '// needs a fact only you have' },
    ],
    rules: () => [
      { id: 'unowned', statement: 's', owner: '', enforcement: { enforcedBy: ['context'] } },
      { id: 'owned', statement: 's', owner: 'CONTRIBUTING.md', enforcement: { enforcedBy: ['context'] } },
    ],`;

  async function run(template: string) {
    const written = new Map<string, string>();
    const writer: IFileWriter = { write: (p, c) => void written.set(p, c) };
    let out = '';
    let err = '';
    const io = { out: (t: string) => (out += t), err: (t: string) => (err += t) };
    const code = await init(new NodeFileSource(root), writer, io, template);
    return { code, written, out, err };
  }

  it('lists every installed template by name and description, and writes nothing, when given no name at all', async () => {
    // `--template` alone used to be refused as "needs a value", the same as a typo'd
    // flag — the commonest way to ask what is here, answered with a refusal.
    manifest({
      name: 'host',
      devDependencies: { '@specwarden/template-demo': '1', '@specwarden/template-other': '1' },
    });
    install('demo', STANDARD);
    install('other', STANDARD);
    const r = await run('');
    expect(r.code).toBe(0);
    expect(r.written.size).toBe(0);
    expect(r.out).toContain('demo — d');
    expect(r.out).toContain('other — d');
    expect(r.err).toBe('');
  });

  it('says plainly that nothing is installed, rather than an empty list', async () => {
    manifest({ name: 'host' });
    const r = await run('');
    expect(r.code).toBe(0);
    expect(r.written.size).toBe(0);
    expect(r.out).toContain('No template installed');
  });

  it('answers the listing even over an already-configured repository — it writes nothing either way', async () => {
    manifest({ name: 'host', devDependencies: { '@specwarden/template-demo': '1' } });
    install('demo', STANDARD);
    const written = new Map<string, string>();
    const writer: IFileWriter = { write: (p, c) => void written.set(p, c) };
    let out = '';
    const io = { out: (t: string) => (out += t), err: () => undefined };
    const files = new NodeFileSource(root);
    const code = await init(files, writer, io, '');
    expect(code).toBe(0);
    expect(out).toContain('demo — d');
  });

  it('writes nothing at all when the template is not installed, and names the package to install', async () => {
    // Resolved BEFORE the first write, so a typo leaves the repository untouched rather
    // than half-scaffolded with a config pointing at checks that were never written.
    manifest({ name: 'host' });
    const r = await run('never-published');
    expect(r.code).toBe(2);
    expect(r.written.size).toBe(0);
    expect(r.err).toContain('@specwarden/template-never-published');
    expect(r.out).toBe('');
  });

  it('writes nothing when the template needs a module the repository has not declared', async () => {
    manifest({ name: 'host' });
    install('needy', "requires: ['@specwarden/docs'], files: () => [], rules: () => [],");
    const r = await run('needy');
    expect(r.code).toBe(2);
    expect(r.written.size).toBe(0);
    expect(r.err).toContain('needs @specwarden/docs');
  });

  it("writes the template's own files under the consumer folder, and no module check beside them", async () => {
    // A template replaces the per-module defaults; writing both would put two checks
    // for the same concern into a tree the newcomer has not read yet.
    manifest({ name: 'host', devDependencies: { '@specwarden/security': '1' } });
    install('demo', STANDARD);
    const r = await run('demo');
    expect(r.code).toBe(0);
    expect([...r.written.keys()].filter((k) => k.includes('/checks/') && !k.endsWith('README.md')).sort()).toEqual([
      '.specwarden/checks/meta/context.check.mjs',
      '.specwarden/checks/ops/compose.check.mjs.example',
    ]);
    expect(r.out).toContain('Template: demo\n');
    expect(r.out).not.toContain('Wired:');
  });

  it('hands the template what this repository is, including the scripts its manifest declares', async () => {
    manifest({ name: 'host', scripts: { lint: 'eslint .', test: 'vitest' }, devDependencies: { vitest: '1' } });
    writeFileSync(join(root, 'pnpm-lock.yaml'), '');
    mkdirSync(join(root, 'docs'));
    writeFileSync(join(root, 'docs', 'a.md'), '#');
    install('demo', STANDARD);
    const r = await run('demo');
    const ctx = JSON.parse(r.written.get('.specwarden/checks/meta/context.check.mjs') ?? '{}') as Record<
      string,
      unknown
    >;
    expect(ctx).toMatchObject({
      docs: 'docs/**/*.md',
      tier: 'fast',
      packageManager: 'pnpm',
      testRunner: 'vitest',
      scripts: ['lint', 'test'],
    });
  });

  it('fills an empty rule owner with the file that holds its reasoning, and keeps an owner the template named', async () => {
    // A template cannot know where this repository keeps it; left empty, the owner would
    // fail rule-owner-resolves. The README it used to get never mentioned the rule.
    manifest({ name: 'host' });
    install('demo', STANDARD);
    const rules = (await run('demo')).written.get('.specwarden/rules.mjs') ?? '';
    expect(rules).toContain(
      "id: 'unowned',\n    statement: 's',\n    owner: '.specwarden/checks/meta/context.check.mjs',",
    );
    expect(rules).toContain("id: 'owned',\n    statement: 's',\n    owner: 'CONTRIBUTING.md',");
  });

  it('owns a rule enforced by something other than a check by the file declaring that enforcer', async () => {
    manifest({ name: 'host' });
    install(
      'demo',
      `requires: [],
      files: () => [{ path: 'perimeter.mjs', body: "export const rules = [{ id: 'no-force-push' }];" }],
      rules: () => [
        { id: 'guarded', statement: 's', owner: '', enforcement: { enforcedBy: ['no-force-push'] } },
        { id: 'loose', statement: 's', owner: '', enforcement: { notMechanizable: 'a person decides' } },
      ],`,
    );
    const rules = (await run('demo')).written.get('.specwarden/rules.mjs') ?? '';
    expect(rules).toContain("id: 'guarded',\n    statement: 's',\n    owner: '.specwarden/perimeter.mjs',");
    // Nothing written enforces it, so the README init writes is the one file that exists.
    expect(rules).toContain("id: 'loose',\n    statement: 's',\n    owner: '.specwarden/README.md',");
  });

  it("writes an example's rule COMMENTED OUT, owned by the file the example becomes", async () => {
    manifest({ name: 'host' });
    install(
      'demo',
      `requires: [],
      files: () => [{ path: 'checks/ops/compose.check.mjs.example', body: '// needs a fact only you have' }],
      rules: () => [{ id: 'compose', statement: 's', owner: '', enforcement: { enforcedBy: ['compose'] } }],`,
    );
    const r = await run('demo');
    const rules = r.written.get('.specwarden/rules.mjs') ?? '';
    expect(rules).toContain(
      "  // { id: 'compose', statement: 's', owner: '.specwarden/checks/ops/compose.check.mjs', enforcement: { enforcedBy: ['compose'] } },",
    );
    expect(rules).not.toMatch(/^ {4}id: 'compose'/m);
    // …and the console names both steps.
    expect(r.out).toContain('rename it to .check.mjs, AND uncomment its rule');
    expect(r.out).toContain("    checks/ops/compose.check.mjs.example → rule 'compose'\n");
  });

  it('names every file it switched off, so a skipped check is a decision rather than a discovery', async () => {
    manifest({ name: 'host' });
    install('demo', STANDARD);
    const r = await run('demo');
    expect(r.out).toContain('Switched OFF until you fill them in');
    expect(r.out).toContain('  checks/ops/compose.check.mjs.example\n');
  });

  it("carries a template's config fields into the config it writes", async () => {
    manifest({ name: 'host' });
    install(
      'demo',
      `${STANDARD}
      configExtras: () => ({ imports: "import { extra } from './extra.mjs';", fields: '  tiers: extra,' }),`,
    );
    const config = (await run('demo')).written.get('.specwarden/config.mjs') ?? '';
    expect(config).toContain("import { extra } from './extra.mjs';");
    expect(config).toContain('  tiers: extra,');
  });

  it('lists the families the template wrote in the checks README, not modules it did not use', async () => {
    // It printed one placeholder row, "the folders beside this README", for every template.
    manifest({ name: 'host', devDependencies: { '@specwarden/docs': '1' } });
    install('demo', STANDARD);
    const readme = (await run('demo')).written.get('.specwarden/checks/README.md') ?? '';
    expect(readme).toContain('| `meta/` | context |');
    expect(readme).toContain('| `ops/` | compose (example, off) |');
    expect(readme).not.toContain('`docs/`');
  });

  it('lists a file written beside checks/ at its real path, not indented under checks/', async () => {
    // The listing read as checks/perimeter.mjs, a path that does not exist.
    manifest({ name: 'host' });
    install(
      'demo',
      `requires: [],
      files: () => [
        { path: 'checks/meta/context.check.mjs', body: '' },
        { path: 'perimeter.mjs', body: '' },
        { path: 'spec-source.mjs', body: '' },
        { path: 'relevance.mjs', body: '' },
      ],
      rules: () => [],`,
    );
    const out = (await run('demo')).out;
    expect(out).toMatch(/^ {2}perimeter\.mjs +what an assistant may not do here/m);
    expect(out).toMatch(/^ {2}spec-source\.mjs +where requirements and tasks come from/m);
    // A file init has no line for is still listed where it is, and credited to the template.
    expect(out).toMatch(/^ {2}relevance\.mjs +written by the template$/m);
    expect(out).toMatch(/^ {2}checks\/ +one file per check[^\n]*\n {4}meta\/context\.check\.mjs\n\n/m);
  });

  it('ends with the steps the tree left undone: the perimeter hook, and no suggest it has nothing for', async () => {
    manifest({ name: 'host' });
    install('demo', `requires: [], files: () => [{ path: 'perimeter.mjs', body: '' }], rules: () => [],`);
    const out = (await run('demo')).out;
    expect(out).toContain('wire the perimeter — until a hook runs it, .specwarden/perimeter.mjs enforces nothing.');
    expect(out).toContain('hooks.PreToolUse');
    expect(out).toContain('node "$CLAUDE_PROJECT_DIR/node_modules/specwarden/bin/specwarden.mjs" perimeter');
    expect(out).not.toContain('specwarden suggest');
  });
});
