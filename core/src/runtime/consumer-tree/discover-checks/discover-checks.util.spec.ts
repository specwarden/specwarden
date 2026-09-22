import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NodeFileSource } from '../../../infrastructure';
import { CheckDiscoveryError, discoverChecks } from './discover-checks.util';

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
});
