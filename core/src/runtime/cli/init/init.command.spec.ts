import { describe, expect, it } from 'vitest';

import type { IFileWriter } from '../../../domain';
import { InMemoryFileSource } from '../../../infrastructure';
import { init } from './init.command';

async function harness(files: Record<string, string> = {}, template?: string) {
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
  it('writes the four constant files, and nothing else, when no module is installed', async () => {
    const h = await harness({ 'package.json': '{"name":"x"}' });
    expect(h.code).toBe(0);
    expect([...h.written.keys()].sort()).toEqual([
      '.specwarden/README.md',
      '.specwarden/checks/README.md',
      '.specwarden/rules.mjs',
      '.specwarden/warden.config.mjs',
    ]);
  });

  it('writes no ratchet and no baseline', async () => {
    // Both are DATA earned by a run. Scaffolding them would hand a repository numbers
    // it never measured, and a ratchet nobody measured is a promise about nothing.
    for (const path of (await harness()).written.keys()) {
      expect(path).not.toContain('ratchet');
      expect(path).not.toContain('baseline');
    }
  });

  it('the config declares no checks — the engine reads checks/ by convention', async () => {
    const config =
      (await harness({ 'package.json': manifestWith('@specwarden/security') })).written.get(
        '.specwarden/warden.config.mjs',
      ) ?? '';
    expect(config).not.toContain('checks:');
    expect(config).not.toContain('secretScan');
    expect(config).toContain('reads `checks/` by convention');
  });

  it('a declared module becomes a check FILE in its family folder', async () => {
    const h = await harness({ 'package.json': manifestWith('@specwarden/security') });
    const file = h.written.get('.specwarden/checks/security/secret-scan.check.mjs') ?? '';
    expect(file).toContain("import { secretScan } from '@specwarden/security';");
    expect(file).toContain("id: 'secret-scan'");
    expect(file).toContain('export const check =');
    // ...and the module it did not declare yields no file
    expect([...h.written.keys()].some((k) => k.includes('/docs/'))).toBe(false);
  });

  it('both modules yield both families, and the doc check points at the docs it found', async () => {
    const h = await harness({
      'package.json': manifestWith('@specwarden/security', '@specwarden/docs'),
      'docs/x.md': '#',
    });
    expect(h.written.has('.specwarden/checks/security/secret-scan.check.mjs')).toBe(true);
    const docs = h.written.get('.specwarden/checks/docs/doc-paths.check.mjs') ?? '';
    expect(docs).toContain("docs: 'docs/**/*.md'");
  });

  it('falls back to a repository-wide glob when there is no docs directory', async () => {
    const docs =
      (await harness({ 'package.json': manifestWith('@specwarden/docs') })).written.get(
        '.specwarden/checks/docs/doc-paths.check.mjs',
      ) ?? '';
    expect(docs).toContain("docs: '**/*.md'");
  });

  it('the check file name and the id inside it are the same word — the convention the engine discovers by', async () => {
    const h = await harness({ 'package.json': manifestWith('@specwarden/security', '@specwarden/docs') });
    for (const [path, body] of h.written) {
      if (!path.endsWith('.check.mjs')) continue;
      const name = path
        .split('/')
        .pop()
        ?.replace(/\.check\.mjs$/, '');
      expect(body).toContain(`id: '${name}'`);
    }
  });
});

describe('init refuses to overwrite', () => {
  it('exits non-zero and names the file when a config already exists', async () => {
    const h = await harness({ '.specwarden/warden.config.mjs': 'export default {};' });
    expect(h.code).toBe(2);
    expect(h.err()).toContain('.specwarden/warden.config.mjs already exists');
    expect(h.written.size).toBe(0);
  });
});

describe('what it tells the reader', () => {
  it('lists the check files it wrote, and the next command', async () => {
    const h = await harness({ 'package.json': manifestWith('@specwarden/security') });
    expect(h.out()).toContain('checks/security/secret-scan.check.mjs');
    expect(h.out()).toContain('specwarden check --all');
  });

  it('says what it detected, including when it detected nothing', async () => {
    expect((await harness()).out()).toContain('no documentation directory found');
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
      for (const [path, body] of (await harness({ 'package.json': manifest })).written) {
        if (!path.endsWith('.mjs')) continue;
        const imports = [...body.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
        for (const i of imports) expect(declared.has(i) || i.startsWith('./'), `${path} imports ${i}`).toBe(true);
      }
    }
  });

  it('the rules file exports the binding the config imports', async () => {
    const w = (await harness()).written;
    expect(w.get('.specwarden/warden.config.mjs')).toContain("import { rules } from './rules.mjs'");
    expect(w.get('.specwarden/rules.mjs')).toContain('export const rules');
  });

  it('the checks README names every family it created, and says how to add one', async () => {
    const readme =
      (await harness({ 'package.json': manifestWith('@specwarden/security', '@specwarden/docs') })).written.get(
        '.specwarden/checks/README.md',
      ) ?? '';
    expect(readme).toContain('`security/`');
    expect(readme).toContain('`docs/`');
    expect(readme).toContain('.check.mjs');
    expect(readme).toContain('RED');
  });

  it('the README explains every path it created and the ones a run will create', async () => {
    const readme = (await harness()).written.get('.specwarden/README.md') ?? '';
    for (const path of ['warden.config.mjs', 'rules.mjs', 'checks/', 'ratchets/', 'perimeter.mjs'])
      expect(readme).toContain(path);
  });
});

describe('a fresh tree has no orphans and no missing enforcer', () => {
  it('every generated check is named by a generated rule, and every rule names a generated check', async () => {
    // The first run of a freshly initialised repository was red on orphan-check: the
    // scaffold wrote two checks and an empty rule list, so the harness's own audit
    // reported the checks it had just been handed. A check arrives with its rule now.
    const h = await harness({ 'package.json': manifestWith('@specwarden/security', '@specwarden/docs') });
    const rules = h.written.get('.specwarden/rules.mjs') ?? '';
    const checkIds = [...h.written.keys()]
      .filter((k) => k.endsWith('.check.mjs'))
      .map((k) =>
        k
          .split('/')
          .pop()
          ?.replace(/\.check\.mjs$/, ''),
      );
    expect(checkIds.length).toBe(2);
    for (const id of checkIds) expect(rules).toContain(`checkIds: ['${id}']`);
    // the owner is a file init itself writes, so rule-owner-resolves cannot fail on it
    expect(rules).toContain("owner: '.specwarden/README.md'");
    expect(h.written.has('.specwarden/README.md')).toBe(true);
  });

  it('with no module installed, the rule list is declared and empty — audits on, nothing to audit', async () => {
    const rules = (await harness({ 'package.json': '{}' })).written.get('.specwarden/rules.mjs') ?? '';
    expect(rules).toContain('export const rules = [');
    expect(rules).not.toContain("checkIds: ['");
  });
});
