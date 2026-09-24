import { describe, expect, it } from 'vitest';

import type { IFileWriter } from '../../../domain';
import { InMemoryFileSource } from '../../../infrastructure';
import { init } from './init.command';

async function setup(files: Record<string, string> = {}, template?: string) {
  const written = new Map<string, string>();
  const writer: IFileWriter = { write: (p, c) => void written.set(p, c) };
  let out = '';
  let err = '';
  const io = { out: (t: string) => (out += t), err: (t: string) => (err += t) };
  const code = await init(new InMemoryFileSource(files), writer, io, template);
  return { code, written, out: () => out, err: () => err };
}

const manifestWith = (...pkgs: string[]) =>
  JSON.stringify({ name: 'x', devDependencies: Object.fromEntries(pkgs.map((p) => [p, '1'])) });

describe('init writes the TREE, not a list', () => {
  // A config under its old name is still this repository's config: a second one beside it
  // would be refused by the very next command.
  it('refuses to write a config beside one under the old name, and writes nothing', async () => {
    const h = await setup({ '.specwarden/warden.config.mjs': 'export default {};' });
    expect(h.code).toBe(2);
    expect(h.written.size).toBe(0);
    expect(h.err()).toBe(
      ".specwarden/warden.config.mjs is the config's old name — rename it to .specwarden/config.mjs, rather than writing a second one.\n",
    );
  });

  it('writes the four constant files, and nothing else, when no module is installed', async () => {
    const h = await setup({ 'package.json': '{"name":"x"}' });
    expect(h.code).toBe(0);
    expect([...h.written.keys()].sort()).toEqual([
      '.specwarden/README.md',
      '.specwarden/checks/README.md',
      '.specwarden/config.mjs',
      '.specwarden/rules.mjs',
    ]);
  });

  it('writes no ratchet and no baseline', async () => {
    // Both are DATA earned by a run. Scaffolding them would hand a repository numbers
    // it never measured, and a ratchet nobody measured is a promise about nothing.
    for (const path of (await setup()).written.keys()) {
      expect(path).not.toContain('ratchet');
      expect(path).not.toContain('baseline');
    }
  });

  it('the config declares no checks — the engine reads checks/ by convention', async () => {
    const config =
      (await setup({ 'package.json': manifestWith('@specwarden/security') })).written.get('.specwarden/config.mjs') ??
      '';
    expect(config).not.toContain('checks:');
    expect(config).not.toContain('secretScan');
    expect(config).toContain('every *.check.mjs under checks/ is found without being named here');
  });

  it('a declared module becomes a check FILE in its family folder', async () => {
    const h = await setup({ 'package.json': manifestWith('@specwarden/security') });
    const file = h.written.get('.specwarden/checks/security/secret-scan.check.mjs') ?? '';
    expect(file).toContain("import { secretScan } from '@specwarden/security';");
    expect(file).toContain("rule: 'A credential never enters the repository, not even a revoked one.'");
    expect(file).toContain('export const check =');
    // ...and the module it did not declare yields no file
    expect([...h.written.keys()].some((k) => k.includes('/docs/'))).toBe(false);
  });

  it('both modules yield both families, and the doc check points at the docs it found', async () => {
    const h = await setup({
      'package.json': manifestWith('@specwarden/security', '@specwarden/docs'),
      'docs/x.md': '#',
    });
    expect(h.written.has('.specwarden/checks/security/secret-scan.check.mjs')).toBe(true);
    const docs = h.written.get('.specwarden/checks/docs/doc-paths.check.mjs') ?? '';
    expect(docs).toContain("docs: 'docs/**/*.md'");
  });

  it('falls back to a repository-wide glob when there is no docs directory', async () => {
    const docs =
      (await setup({ 'package.json': manifestWith('@specwarden/docs') })).written.get(
        '.specwarden/checks/docs/doc-paths.check.mjs',
      ) ?? '';
    expect(docs).toContain("docs: '**/*.md'");
  });

  it('names no id inside a check file — the file name is the id, the convention the engine discovers by', async () => {
    const h = await setup({ 'package.json': manifestWith('@specwarden/security', '@specwarden/docs') });
    const checks = [...h.written].filter(([path]) => path.endsWith('.check.mjs'));
    expect(checks.length).toBe(2);
    for (const [path, body] of checks) expect(body, path).not.toMatch(/^\s+id: '/m);
  });
});

describe('init refuses to overwrite', () => {
  it('exits non-zero and names the file when a config already exists', async () => {
    const h = await setup({ '.specwarden/config.mjs': 'export default {};' });
    expect(h.code).toBe(2);
    expect(h.err()).toContain('.specwarden/config.mjs already exists');
    expect(h.written.size).toBe(0);
  });
});

describe('what it tells the reader', () => {
  it('lists the check files it wrote under checks/, and the next command', async () => {
    const h = await setup({ 'package.json': manifestWith('@specwarden/security') });
    expect(h.out()).toMatch(/ {2}checks\/ +one file per check[^\n]*\n {4}security\/secret-scan\.check\.mjs\n/);
    expect(h.out()).toContain('specwarden check --all');
  });

  it('recommends suggest without a template — there is a tree to grow, and nothing chosen yet', async () => {
    expect((await setup({ 'package.json': manifestWith('@specwarden/security') })).out()).toContain(
      'specwarden suggest',
    );
  });

  it('says what it detected, including when it detected nothing', async () => {
    expect((await setup()).out()).toContain('no documentation directory found');
  });
});

describe('the generated files are usable as written', () => {
  it('imports nothing the repository has not declared, in any generated file', async () => {
    // The defect this pins: the scaffold once emitted `import { docPaths } from
    // 'specwarden'` months after that check moved to a module. It typechecked, it read
    // correctly, and it failed on the first run with an import error.
    for (const manifest of [
      '{}',
      manifestWith('@specwarden/security'),
      manifestWith('@specwarden/docs', '@specwarden/security'),
    ]) {
      const declared = new Set(['specwarden', ...Object.keys(JSON.parse(manifest).devDependencies ?? {})]);
      for (const [path, body] of (await setup({ 'package.json': manifest })).written) {
        if (!path.endsWith('.mjs')) continue;
        const imports = [...body.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
        for (const i of imports) expect(declared.has(i) || i.startsWith('./'), `${path} imports ${i}`).toBe(true);
      }
    }
  });

  it('the rules file exports the binding the config imports', async () => {
    const w = (await setup()).written;
    expect(w.get('.specwarden/config.mjs')).toContain("import { rules } from './rules.mjs'");
    expect(w.get('.specwarden/rules.mjs')).toContain('export const rules');
  });

  it('the checks README names every family it created, and says how to add one', async () => {
    const readme =
      (await setup({ 'package.json': manifestWith('@specwarden/security', '@specwarden/docs') })).written.get(
        '.specwarden/checks/README.md',
      ) ?? '';
    expect(readme).toContain('`security/`');
    expect(readme).toContain('`docs/`');
    expect(readme).toContain('.check.mjs');
    expect(readme).toContain('RED');
  });

  it('the README explains every path it created, and none it did not', async () => {
    // It listed perimeter.mjs, relevance.mjs, ratchets/ and baseline/ in trees holding none.
    const readme = (await setup()).written.get('.specwarden/README.md') ?? '';
    for (const path of ['config.mjs', 'rules.mjs', 'checks/']) expect(readme).toContain(path);
    for (const path of ['perimeter.mjs', 'relevance.mjs', 'ratchets/', 'baseline/']) expect(readme).not.toContain(path);
  });
});

describe('a fresh tree has no orphans and no missing enforcer', () => {
  it('every generated check states the rule it enforces, so no register entry can drift from it', async () => {
    // The first run of a freshly initialised repository was red on orphan-check: the
    // scaffold wrote two checks and an empty rule list. The check carries its rule now —
    // owned by its own file, which exists by construction — and the register stays empty.
    const h = await setup({ 'package.json': manifestWith('@specwarden/security', '@specwarden/docs') });
    const checks = [...h.written].filter(([path]) => path.endsWith('.check.mjs'));
    expect(checks.length).toBe(2);
    for (const [path, body] of checks) expect(body, path).toMatch(/^\s+rule: '/m);
    expect(h.written.get('.specwarden/rules.mjs')).not.toContain("enforcedBy: ['");
  });

  it('with no module installed, the rule list is declared and empty — audits on, nothing to audit', async () => {
    const rules = (await setup({ 'package.json': '{}' })).written.get('.specwarden/rules.mjs') ?? '';
    expect(rules).toContain('export const rules = [');
    expect(rules).not.toContain("enforcedBy: ['");
  });
});
