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
      { id: 'unowned', statement: 's', owner: '', enforcement: { checkIds: ['context'] } },
      { id: 'owned', statement: 's', owner: 'CONTRIBUTING.md', enforcement: { checkIds: ['context'] } },
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

  it('fills an empty rule owner with the README init itself writes, and keeps an owner the template named', async () => {
    // A template cannot know where this repository's README is; left empty, the owner
    // would fail rule-owner-resolves on the very first run.
    manifest({ name: 'host' });
    install('demo', STANDARD);
    const rules = (await run('demo')).written.get('.specwarden/rules.mjs') ?? '';
    expect(rules).toContain("id: 'unowned',\n    statement: 's',\n    owner: '.specwarden/README.md',");
    expect(rules).toContain("id: 'owned',\n    statement: 's',\n    owner: 'CONTRIBUTING.md',");
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
    const config = (await run('demo')).written.get('.specwarden/warden.config.mjs') ?? '';
    expect(config).toContain("import { extra } from './extra.mjs';");
    expect(config).toContain('  tiers: extra,');
  });

  it('credits the template in the checks README rather than listing modules it did not use', async () => {
    manifest({ name: 'host', devDependencies: { '@specwarden/docs': '1' } });
    install('demo', STANDARD);
    const readme = (await run('demo')).written.get('.specwarden/checks/README.md') ?? '';
    expect(readme).toContain('from the `demo` template');
    expect(readme).not.toContain('`docs/`');
  });
});
