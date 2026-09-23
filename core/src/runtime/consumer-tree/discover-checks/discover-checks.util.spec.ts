import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NodeFileSource } from '../../../infrastructure';
import { CheckDiscoveryError, describeError, discoverChecks } from './discover-checks.util';

/**
 * Discovery reads REAL files through a real import, so these run against a temp tree
 * rather than the in-memory source: an `import()` cannot be faked without faking the
 * one thing under test.
 */

const CHECK = (id: string, exportName = 'check') =>
  `export const ${exportName} = { id: '${id}', title: '${id}', tier: 'fast', zone: 'consumer', capabilities: [], contractVersion: 1, when: () => true, run: () => ({ ok: true, findings: [] }) };\n`;

describe('discoverChecks', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'spw-discover-'));
    mkdirSync(join(root, '.specwarden', 'checks', 'docs'), { recursive: true });
    mkdirSync(join(root, '.specwarden', 'checks', 'ops'), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const write = (rel: string, body: string) => writeFileSync(join(root, '.specwarden', 'checks', rel), body);
  const run = () => discoverChecks(new NodeFileSource(root), '.specwarden/checks');

  it('finds every *.check.mjs beneath the folder, however deep, in path order', async () => {
    write('ops/b-second.check.mjs', CHECK('b'));
    write('docs/a-first.check.mjs', CHECK('a'));
    const { checks, files } = await run();
    expect(checks.map((c) => c.id)).toEqual(['a', 'b']);
    expect(files).toHaveLength(2);
  });

  it('accepts the three export spellings the consumer zone already used', async () => {
    write('docs/one.check.mjs', CHECK('one', 'check'));
    write('docs/two.check.mjs', CHECK('two', 'gateCheck'));
    write(
      'docs/many.check.mjs',
      `export const checks = [${CHECK('three').replace('export const check = ', '').trim().replace(/;$/, '')}];\n`,
    );
    write('docs/dflt.check.mjs', CHECK('four').replace('export const check =', 'export default'));
    const { checks } = await run();
    expect(checks.map((c) => c.id).sort()).toEqual(['four', 'one', 'three', 'two']);
  });

  it('ignores helpers, tests and data — only *.check.mjs is a check', async () => {
    write('docs/a.check.mjs', CHECK('a'));
    write('docs/_shared.mjs', 'export const helper = 1;\n');
    write('docs/a.check.test.mjs', 'export const nothing = 1;\n');
    write('docs/allow.json', '{}');
    const { checks } = await run();
    expect(checks.map((c) => c.id)).toEqual(['a']);
  });

  it('refuses a check file that exports no check — a silent skip would read as coverage', async () => {
    write('docs/empty.check.mjs', 'export const notACheck = 42;\n');
    await expect(run()).rejects.toThrow(CheckDiscoveryError);
    await expect(run()).rejects.toThrow(/exports no check/);
  });

  it('refuses two files claiming one id', async () => {
    write('docs/x.check.mjs', CHECK('dup'));
    write('ops/y.check.mjs', CHECK('dup'));
    await expect(run()).rejects.toThrow(/'dup' is exported by both/);
  });

  it('an empty folder yields nothing and says so through the file list', async () => {
    const { checks, files } = await run();
    expect(checks).toEqual([]);
    expect(files).toEqual([]);
  });

  it('one object exported twice is one check, not a duplicate of itself', async () => {
    write('docs/x.check.mjs', `${CHECK('x')}export default check;\n`);
    expect((await run()).checks.map((c) => c.id)).toEqual(['x']);
  });
});

/**
 * What the FILE supplies, and every way a file fails to be a check. A factory builds an
 * unnamed check with the id `<unnamed>` (see `buildCheck`); here that shape is written by
 * hand, because a temp tree cannot import the engine by name.
 */
describe('discoverChecks — what the file supplies, and what it refuses', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'spw-discover-file-'));
    mkdirSync(join(root, '.specwarden', 'checks', 'hygiene'), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const write = (rel: string, body: string) => writeFileSync(join(root, '.specwarden', 'checks', rel), body);
  const run = () => discoverChecks(new NodeFileSource(root), '.specwarden/checks');
  const built = (fields: string) =>
    `{ id: '<unnamed>', title: '<unnamed>', tier: 'fast', zone: 'consumer', capabilities: [], contractVersion: 1, when: () => true, run: () => ({ ok: true, findings: [] }), ${fields} }`;

  it('names a check exported ALONE with no id after its file, title and ratchet included', async () => {
    // It was refused as a file that "exports no check" — it did export one, only unnamed.
    write('hygiene/no-todo.check.mjs', `export const check = ${built("ratchet: { id: '<unnamed>', ceiling: 3 }")};\n`);
    const [check] = (await run()).checks;
    expect([check.id, check.title, check.ratchet?.id]).toEqual(['no-todo', 'no-todo', 'no-todo']);
  });

  it('never renames a check that says its own id — the file name is only a default', async () => {
    write('hygiene/no-todo.check.mjs', CHECK('no-todos'));
    expect((await run()).checks.map((c) => c.id)).toEqual(['no-todos']);
  });

  it('gives a rule with no owner the file that declares it, and leaves a named owner alone', async () => {
    write('hygiene/a.check.mjs', `export const check = ${built("rule: { statement: 'a holds' }")};\n`);
    write(
      'hygiene/b.check.mjs',
      `export const check = ${built("rule: { statement: 'b holds', owner: 'README.md' }")};\n`,
    );
    const { checks } = await run();
    expect(checks.map((c) => c.rule)).toEqual([
      { statement: 'a holds', owner: '.specwarden/checks/hygiene/a.check.mjs' },
      { statement: 'b holds', owner: 'README.md' },
    ]);
  });

  it('refuses an unnamed check in a file that exports several — none of them is the file', async () => {
    write(
      'hygiene/many.check.mjs',
      `export const checks = [${built('')}, ${CHECK('b').replace('export const check = ', '').trim().replace(/;$/, '')}];\n`,
    );
    await expect(run()).rejects.toThrow(
      ".specwarden/checks/hygiene/many.check.mjs exports 2 checks, and 1 of them has no `id`. Only a check exported alone takes its file's name ('many'); give each check here an id.",
    );
  });

  it('refuses a hand-written object literal by file, with the fix — it crashed on "contract vundefined"', async () => {
    write(
      'hygiene/lit.check.mjs',
      "export const check = { id: 'lit', title: 't', tier: 'fast', run: () => ({ ok: true, findings: [] }) };\n",
    );
    await expect(run()).rejects.toThrow(
      /^\.specwarden\/checks\/hygiene\/lit\.check\.mjs: 'lit' is a hand-written object, not a built check .* Wrap the body in `defineCheck\(\{ … \}\)`/,
    );
  });

  it('refuses a built-looking check whose id is not a string', async () => {
    write('hygiene/odd.check.mjs', `export const check = ${built('').replace("id: '<unnamed>'", 'id: 7')};\n`);
    await expect(run()).rejects.toThrow(
      '.specwarden/checks/hygiene/odd.check.mjs exports a check whose `id` is not a string',
    );
  });

  it('refuses a file that throws while it loads, naming the file and the error — never a raw stack', async () => {
    write('hygiene/boom.check.mjs', "throw new Error('boom at import');\n");
    write('hygiene/syntax.check.mjs', 'export const check = 1 as const;\n');
    await expect(run()).rejects.toThrow('.specwarden/checks/hygiene/boom.check.mjs failed to load: boom at import');
    rmSync(join(root, '.specwarden', 'checks', 'hygiene', 'boom.check.mjs'));
    // The parser's own kind differs under the test runner (it transforms the import), so
    // only the frame is pinned: the file, "failed to load", and no stack.
    const refusal = await run().catch((error: Error) => error.message);
    expect(refusal).toMatch(/^\.specwarden\/checks\/hygiene\/syntax\.check\.mjs failed to load: \S/);
    expect(refusal).not.toMatch(/\n\s+at /);
  });

  it.each(['ts', 'js', 'cjs', 'mts'])(
    'refuses a check written as *.check.%s, with the rename — it was silently skipped',
    async (ext) => {
      write(`hygiene/no-todo.check.${ext}`, CHECK('no-todo'));
      await expect(run()).rejects.toThrow(
        `.specwarden/checks/hygiene/no-todo.check.${ext}: a check under .specwarden/checks/ is a \`*.check.mjs\` file, and this one is not — so it was never loaded. Rename it: .specwarden/checks/hygiene/no-todo.check.${ext} → .specwarden/checks/hygiene/no-todo.check.mjs.`,
      );
    },
  );

  it('records the file each check came from', async () => {
    write('hygiene/a.check.mjs', CHECK('a'));
    const { checks, origins } = await run();
    expect(origins.get(checks[0])).toBe('.specwarden/checks/hygiene/a.check.mjs');
  });
});

describe('describeError', () => {
  it('is the message, with its kind only when the kind says something', () => {
    expect(describeError(new Error('plain'))).toBe('plain');
    expect(describeError(new TypeError('x is not a function'))).toBe('TypeError: x is not a function');
    expect(describeError('a string')).toBe('a string');
  });
});

describe('discoverChecks — the plural refusals', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'spw-discover-plural-'));
    mkdirSync(join(root, '.specwarden', 'checks'), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const write = (rel: string, body: string) => writeFileSync(join(root, '.specwarden', 'checks', rel), body);
  const run = () => discoverChecks(new NodeFileSource(root), '.specwarden/checks');
  const unnamed =
    "{ id: '<unnamed>', title: '<unnamed>', tier: 'fast', zone: 'consumer', capabilities: [], contractVersion: 1, when: () => true, run: () => ({ ok: true, findings: [] }) }";

  it('names every misnamed file, and the rename for the first', async () => {
    write('a.check.ts', '');
    write('b.check.js', '');
    await expect(run()).rejects.toThrow(
      '.specwarden/checks/a.check.ts, .specwarden/checks/b.check.js: a check under .specwarden/checks/ is a `*.check.mjs` file, and these are not — so they were never loaded.',
    );
  });

  it('counts every unnamed check in a file that exports several', async () => {
    write('two.check.mjs', `export const checks = [${unnamed}, ${unnamed}];\n`);
    await expect(run()).rejects.toThrow('exports 2 checks, and 2 of them have no `id`.');
  });

  it('reports a thrown value that is not an Error as itself', async () => {
    write('str.check.mjs', "throw 'a plain string';\n");
    await expect(run()).rejects.toThrow('.specwarden/checks/str.check.mjs failed to load: a plain string');
  });

  it('refuses a hand-written object with no id at all, calling it what it is', async () => {
    write('anon.check.mjs', 'export const check = { run: () => ({ ok: true, findings: [] }) };\n');
    await expect(run()).rejects.toThrow(
      '.specwarden/checks/anon.check.mjs: the check it exports is a hand-written object',
    );
  });
});
