import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InMemoryFileSource, NodeFileSource } from '../../../../infrastructure';
import { installedTemplates, loadTemplate, packageForTemplate } from './load-template.util';

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
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: packageForTemplate(name), type: 'module', main: 'index.mjs' }),
    );
    writeFileSync(join(dir, 'index.mjs'), source);
  };

  const declare = (...pkgs: string[]) =>
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'host', devDependencies: Object.fromEntries(pkgs.map((p) => [p, '1'])) }),
    );

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
    expect(problem).toContain('@specwarden/template-missing');
    expect(problem).toContain('omit --template');
  });

  it('refuses a template whose modules the repository has not declared, BEFORE writing anything', async () => {
    // Its generated files import those modules; writing them would produce a tree that
    // fails on its first run with an import error — the run that decides whether the
    // tool is kept.
    installTemplate('demo', TEMPLATE(['@specwarden/docs', '@specwarden/ops']));
    const { template, problem } = await loadTemplate('demo', new NodeFileSource(root));
    expect(template).toBeUndefined();
    expect(problem).toContain('@specwarden/docs, @specwarden/ops');
    expect(problem).toContain('first run');
  });

  it('accepts it once they are declared', async () => {
    installTemplate('demo', TEMPLATE(['@specwarden/docs']));
    declare('@specwarden/docs');
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

  it.each([
    ['name', "name: 1, describe: 'd', requires: [], files: () => [], rules: () => []"],
    ['describe', "name: 'n', requires: [], files: () => [], rules: () => []"],
    ['requires', "name: 'n', describe: 'd', requires: 'x', files: () => [], rules: () => []"],
    ['files', "name: 'n', describe: 'd', requires: [], files: [], rules: () => []"],
    ['rules', "name: 'n', describe: 'd', requires: [], files: () => []"],
  ])('does not mistake an object with a wrong %s for a template', async (_member, body) => {
    // Each member is called or read unguarded once the object is accepted; a shape
    // test that let one through would move the failure into `init`, mid-write.
    installTemplate('demo', `export const almost = { ${body} };\nexport const nothing = null;`);
    const { problem } = await loadTemplate('demo', new NodeFileSource(root));
    expect(problem).toContain('exports no template');
  });

  it('finds the template among other exports, whatever it is called', async () => {
    installTemplate('demo', `export const VERSION = '1';\nexport const helper = () => 1;\n${TEMPLATE()}`);
    const { template } = await loadTemplate('demo', new NodeFileSource(root));
    expect(template?.name).toBe('demo');
  });
});

describe('what a template requires depends on the repository it is written into', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'spw-tpl-req-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const setup = (manifest: object, source: string) => {
    writeFileSync(join(root, 'package.json'), JSON.stringify(manifest));
    const dir = join(root, 'node_modules', packageForTemplate('demo'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', type: 'module', main: 'index.mjs' }));
    writeFileSync(join(dir, 'index.mjs'), source);
  };

  const FN_TEMPLATE = `export const t = {
    name: 'demo', describe: 'd', files: () => [], rules: () => [],
    requires: (ctx) => (ctx.ci === 'github' ? ['@specwarden/ci'] : []),
  };`;

  it('asks a function-valued `requires` with this repository’s context, and refuses on its answer', async () => {
    setup({ name: 'host' }, FN_TEMPLATE);
    const ctx = { docs: '**/*.md', tier: 'fast', workspaces: [], ci: 'github' as const };
    const { problem } = await loadTemplate('demo', new NodeFileSource(root), ctx);
    expect(problem).toContain("the 'demo' template needs @specwarden/ci");
  });

  it('accepts the same template where its context requires nothing', async () => {
    setup({ name: 'host' }, FN_TEMPLATE);
    const ctx = { docs: '**/*.md', tier: 'fast', workspaces: [] };
    const { template, problem } = await loadTemplate('demo', new NodeFileSource(root), ctx);
    expect(problem).toBeUndefined();
    expect(template?.name).toBe('demo');
  });

  it('treats a repository with no manifest as having declared nothing, not everything', async () => {
    setup({ name: 'host' }, FN_TEMPLATE.replace("ctx.ci === 'github' ? ['@specwarden/ci'] : []", "['@specwarden/ci']"));
    rmSync(join(root, 'package.json'));
    const ctx = { docs: '**/*.md', tier: 'fast', workspaces: [] };
    const { problem } = await loadTemplate('demo', new NodeFileSource(root), ctx);
    expect(problem).toContain('needs @specwarden/ci');
  });

  it('counts a requirement declared under dependencies as well as devDependencies', async () => {
    setup(
      { name: 'host', dependencies: { '@specwarden/ci': '1' } },
      FN_TEMPLATE.replace("ctx.ci === 'github' ? ['@specwarden/ci'] : []", "['@specwarden/ci']"),
    );
    const ctx = { docs: '**/*.md', tier: 'fast', workspaces: [] };
    expect((await loadTemplate('demo', new NodeFileSource(root), ctx)).problem).toBeUndefined();
  });
});

describe('a name nobody installed is answered with the names that are', () => {
  const at = (tree: Record<string, string>) => new InMemoryFileSource(tree, mkdtempSync(join(tmpdir(), 'spw-tpl-no-')));
  const ctx = { docs: '**/*.md', tier: 'fast', workspaces: [] };

  it('lists the installed templates, sorted, from both dependency lists', async () => {
    // A wrong name is the commonest first-minute mistake with a scaffold.
    const files = at({
      'package.json': JSON.stringify({
        dependencies: { '@specwarden/template-zeta': '1' },
        devDependencies: { '@specwarden/template-alpha': '1', '@specwarden/docs': '1' },
      }),
    });
    try {
      const { problem } = await loadTemplate('nodets', files, ctx);
      expect(problem).toContain('  Installed here: alpha, zeta\n');
      // A module that is not a template is not offered as one.
      expect(problem).not.toContain('docs');
    } finally {
      rmSync(files.root(), { recursive: true, force: true });
    }
  });

  it('does not offer the very name that failed to resolve', async () => {
    // Declared but not installed: "Installed here: node-ts" beside "no template
    // 'node-ts'" would contradict itself in one message.
    // (A name nothing publishes: under a pnpm-run test NODE_PATH reaches the workspace
    // store, where the real templates resolve from any directory.)
    const files = at({
      'package.json': JSON.stringify({ devDependencies: { '@specwarden/template-unpublished': '1' } }),
    });
    try {
      const { problem } = await loadTemplate('unpublished', files, ctx);
      expect(problem).toContain("no template 'unpublished'");
      expect(problem).not.toContain('Installed here');
    } finally {
      rmSync(files.root(), { recursive: true, force: true });
    }
  });

  it('still answers, without a list, when the manifest is missing or does not parse', async () => {
    for (const tree of [{}, { 'package.json': '{ not json' }]) {
      const files = at(tree);
      try {
        const { problem } = await loadTemplate('x', files, ctx);
        expect(problem).toContain('the package @specwarden/template-x is not installed here');
        expect(problem).not.toContain('Installed here');
      } finally {
        rmSync(files.root(), { recursive: true, force: true });
      }
    }
  });
});

describe('installedTemplates', () => {
  it('answers the template names alone, without the scope', () => {
    const files = new InMemoryFileSource({
      'package.json': JSON.stringify({ devDependencies: { '@specwarden/template-docs-only': '1', vitest: '1' } }),
    });
    expect(installedTemplates(files)).toEqual(['docs-only']);
  });
});
