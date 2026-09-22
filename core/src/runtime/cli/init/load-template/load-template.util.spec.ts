import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NodeFileSource } from '../../../../infrastructure';
import { loadTemplate, packageForTemplate } from './load-template.util';

/**
 * Resolution is the whole subject here, so these run against a real directory with a
 * real `node_modules` — an in-memory source cannot answer what `require.resolve` does.
 *
 * The defect they pin: the first version imported the package by bare specifier, which
 * Node resolves from the ENGINE's location. A template is the consumer's dependency and
 * is correctly absent there, so `--template x` reported "not installed" for a template
 * that was installed, in the repository, where it belongs.
 */
describe('loadTemplate resolves from the repository, not from the engine', () => {
  let root: string;

  const installTemplate = (name: string, source: string) => {
    const dir = join(root, 'node_modules', packageForTemplate(name));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: packageForTemplate(name), type: 'module', main: 'index.mjs' }));
    writeFileSync(join(dir, 'index.mjs'), source);
  };

  const declare = (...pkgs: string[]) =>
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'host', devDependencies: Object.fromEntries(pkgs.map((p) => [p, '1'])) }));

  const TEMPLATE = (requires: string[] = []) => `export const t = {
    name: 'demo',
    describe: 'a demo',
    requires: ${JSON.stringify(requires)},
    files: () => [{ path: 'checks/x/y.check.mjs', body: '' }],
    rules: () => [],
  };`;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'spw-tpl-'));
    declare();
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('loads a template installed in the repository', async () => {
    installTemplate('demo', TEMPLATE());
    const { template, problem } = await loadTemplate('demo', new NodeFileSource(root));
    expect(problem).toBeUndefined();
    expect(template?.name).toBe('demo');
    expect(template?.files({ docs: '**/*.md', tier: 'fast', workspaces: [] })).toHaveLength(1);
  });

  it('names the package to install when there is none', async () => {
    const { template, problem } = await loadTemplate('missing', new NodeFileSource(root));
    expect(template).toBeUndefined();
    expect(problem).toContain('specwarden-template-missing');
    expect(problem).toContain('omit --template');
  });

  it('refuses a template whose modules the repository has not declared, BEFORE writing anything', async () => {
    // Its generated files import those modules; writing them would produce a tree that
    // fails on its first run with an import error — the run that decides whether the
    // tool is kept.
    installTemplate('demo', TEMPLATE(['specwarden-module-docs', 'specwarden-module-ops']));
    const { template, problem } = await loadTemplate('demo', new NodeFileSource(root));
    expect(template).toBeUndefined();
    expect(problem).toContain('specwarden-module-docs, specwarden-module-ops');
    expect(problem).toContain('first run');
  });

  it('accepts it once they are declared', async () => {
    installTemplate('demo', TEMPLATE(['specwarden-module-docs']));
    declare('specwarden-module-docs');
    const { template, problem } = await loadTemplate('demo', new NodeFileSource(root));
    expect(problem).toBeUndefined();
    expect(template?.name).toBe('demo');
  });

  it('refuses a package that exports nothing template-shaped, and says what is missing', async () => {
    installTemplate('demo', 'export const notATemplate = { name: 1 };');
    const { problem } = await loadTemplate('demo', new NodeFileSource(root));
    expect(problem).toContain('exports no template');
    expect(problem).toContain('files()');
  });
});
