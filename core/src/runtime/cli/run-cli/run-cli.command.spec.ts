import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ICliIo } from '../../../index';
import { findConfig, main } from '../../../index';

function captureIo(): { io: ICliIo; out: () => string; err: () => string } {
  let out = '';
  let err = '';
  return {
    io: { out: (t) => (out += t), err: (t) => (err += t) },
    out: () => out,
    err: () => err,
  };
}

describe('main over a temp consumer config', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spw-cli-'));
    mkdirSync(join(dir, '.specwarden'));
    writeFileSync(join(dir, 'README.md'), '# temp\n');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** A config authored as a plain object, so it needs no import from 'specwarden'
   * (the temp dir is outside the workspace and could not resolve it). */
  function writeConfig(body: string): void {
    writeFileSync(join(dir, '.specwarden', 'warden.config.mjs'), body);
  }

  it('finds the config by walking up from a nested cwd', () => {
    writeConfig('export default { checks: [] };');
    const nested = join(dir, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    const found = findConfig(nested);
    expect(found?.root).toBe(dir);
  });

  it('runs a native check and exits 0', async () => {
    writeConfig(
      `export default { checks: [{ id: 'ok', title: 'ok', tier: 'fast', zone: 'consumer', capabilities: ['read'], contractVersion: 1, when: () => true, run: (ctx) => ({ ok: ctx.files.exists('README.md'), findings: [] }) }] };`,
    );
    const cap = captureIo();
    const code = await main(['check', '--tier', 'fast'], {}, dir, cap.io);
    expect(code).toBe(0);
    expect(cap.out()).toContain('▶ ok — ok');
  });

  it('exits 1 when a blocking check fails', async () => {
    writeConfig(
      `export default { checks: [{ id: 'bad', title: 'bad', tier: 'fast', zone: 'consumer', capabilities: [], contractVersion: 1, when: () => true, run: () => ({ ok: false, findings: [] }) }] };`,
    );
    const code = await main(['check', '--tier', 'fast'], {}, dir, captureIo().io);
    expect(code).toBe(1);
  });

  it('--list prints the manifest and runs nothing', async () => {
    writeConfig(
      `export default { checks: [{ id: 'one', title: 'first', tier: 'fast', zone: 'consumer', capabilities: [], contractVersion: 1, when: () => true, run: () => { throw new Error('should not run under --list'); } }] };`,
    );
    const cap = captureIo();
    const code = await main(['check', '--tier', 'fast', '--list'], {}, dir, cap.io);
    expect(code).toBe(0);
    expect(cap.out()).toContain('one\tfirst\n');
    // The harness's own check rides along by convention — a consumer that declared
    // one check has two in the manifest, and the second one is the engine's.
    expect(cap.out()).toContain('ratchet-direction\t');
  });

  it('doctor lists each check with its declared capabilities', async () => {
    writeConfig(
      `export default { denyCapabilities: ['net'], checks: [` +
        `{ id: 'a', title: 'a', tier: 'fast', zone: 'consumer', capabilities: ['read'], contractVersion: 1, when: () => true, run: () => ({ ok: true, findings: [] }) },` +
        `{ id: 'b', title: 'b', tier: 'heavy', zone: 'consumer', capabilities: ['net'], contractVersion: 1, when: () => true, run: () => ({ ok: true, findings: [] }) }] };`,
    );
    const cap = captureIo();
    const code = await main(['doctor'], {}, dir, cap.io);
    expect(code).toBe(0);
    expect(cap.out()).toContain('a\tfast\tconsumer\t[read]');
    expect(cap.out()).toContain('b\theavy\tconsumer\t[net] DENIED');
    expect(cap.out()).toContain('denyCapabilities: net');
  });

  it('doctor counts the ASSEMBLED register, including the rules checks declare themselves', async () => {
    // It read `config.rules` directly, so the moment a rule could live on its check the
    // diagnostic reported those checks as orphans — the harness saying it was broken in
    // exactly the way it was not, in the command whose job is answering that question.
    writeConfig(
      `export default { rules: [], checks: [` +
        `{ id: 'a', title: 'a', tier: 'fast', zone: 'consumer', capabilities: [], contractVersion: 1,` +
        ` rule: { statement: 'a holds', owner: 'README.md' }, when: () => true, run: () => ({ ok: true, findings: [] }) }] };`,
    );
    const cap = captureIo();

    expect(await main(['doctor'], {}, dir, cap.io)).toBe(0);
    expect(cap.out()).toContain('checks enforcing no rule (orphans): 0');
    expect(cap.out()).toMatch(/declared: [1-9]/);
  });

  it('migrate reports a current-version config as nothing to do', async () => {
    writeConfig('export default { version: 1, checks: [] };');
    const cap = captureIo();
    expect(await main(['migrate'], {}, dir, cap.io)).toBe(0);
    expect(cap.out()).toContain('nothing to migrate');
  });

  it('refuses a config declaring a newer version than the engine speaks', async () => {
    writeConfig('export default { version: 99, checks: [] };');
    const cap = captureIo();
    expect(await main(['check', '--tier', 'fast'], {}, dir, cap.io)).toBe(2);
    expect(cap.err()).toContain('version 99');
  });

  it('adopt reports the repo shape without a config', async () => {
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
    writeFileSync(join(dir, 'package.json'), '{ "devDependencies": { "vitest": "^4" } }');
    const cap = captureIo();
    // no .specwarden config needed — adopt runs on a raw repo
    expect(await main(['adopt'], {}, dir, cap.io)).toBe(0);
    expect(cap.out()).toContain('package manager : pnpm');
    expect(cap.out()).toContain('test runner     : vitest');
  });

  it('suggest proposes a consistent convention with its ratchet, and enables nothing', async () => {
    writeFileSync(join(dir, 'a.service.ts'), '');
    writeFileSync(join(dir, 'a.service.spec.ts'), '');
    writeFileSync(join(dir, 'b.service.ts'), '');
    writeFileSync(join(dir, 'b.service.spec.ts'), '');
    const cap = captureIo();
    expect(await main(['suggest'], {}, dir, cap.io)).toBe(0);
    expect(cap.out()).toContain('siblingRequired');
    expect(cap.out()).toContain('Nothing was enabled');
  });

  it('rejects an unknown tier and a missing config with exit 2', async () => {
    writeConfig('export default { checks: [] };');
    expect(await main(['check', '--tier', 'bogus'], {}, dir, captureIo().io)).toBe(2);
    const empty = mkdtempSync(join(tmpdir(), 'spw-noconf-'));
    expect(await main(['check', '--tier', 'fast'], {}, empty, captureIo().io)).toBe(2);
    rmSync(empty, { recursive: true, force: true });
  });
});

describe(`tiers are the repository's to name`, () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spw-tiers-'));
    mkdirSync(join(dir, '.specwarden'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const config = (body: string) => writeFileSync(join(dir, '.specwarden', 'warden.config.mjs'), body);

  it('refuses a tier the config does not declare, and names the ones it does', async () => {
    config("export default { checks: [], tiers: ['pre-commit', 'pr'] };");
    const { io, err } = captureIo();
    expect(await main(['check', '--tier', 'nightly'], {}, dir, io)).toBe(2);
    expect(err()).toContain('unknown tier "nightly"');
    expect(err()).toContain('pre-commit, pr');
  });

  it('accepts a tier it does declare', async () => {
    config("export default { checks: [], tiers: ['pre-commit', 'pr'] };");
    const { io } = captureIo();
    expect(await main(['check', '--tier', 'pre-commit', '--list'], {}, dir, io)).toBe(0);
  });

  it('falls back to the built-in three when the config names none', async () => {
    config('export default { checks: [] };');
    const { io, err } = captureIo();
    expect(await main(['check', '--tier', 'fast', '--list'], {}, dir, io)).toBe(0);
    expect(await main(['check', '--tier', 'pr', '--list'], {}, dir, io)).toBe(2);
    expect(err()).toContain('fast, heavy, nightly');
  });
});

describe('check flags that used to be forwarded unread', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spw-flags-'));
    mkdirSync(join(dir, '.specwarden'));
    writeFileSync(
      join(dir, '.specwarden', 'warden.config.mjs'),
      `export default { checks: [{ id: 'a', title: 'a', tier: 'fast', zone: 'consumer', capabilities: [], contractVersion: 1, when: () => true, run: () => ({ ok: true, findings: [] }) }] };`,
    );
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('refuses a --shard that is not i/N', async () => {
    // It was appended to a suite's command line verbatim. A runner that shrugs at an
    // unparseable shard then runs everything (so CI does the suite N times) or nothing
    // (so it reports green over no tests).
    const cap = captureIo();

    expect(await main(['check', '--tier', 'fast', '--shard', '1of3'], {}, dir, cap.io)).toBe(2);
    expect(cap.err()).toContain('must be written i/N');
  });

  it('refuses a --shard index outside its own range', async () => {
    const cap = captureIo();

    expect(await main(['check', '--tier', 'fast', '--shard', '4/3'], {}, dir, cap.io)).toBe(2);
    expect(cap.err()).toContain('part 4 of 3');
  });

  it('accepts a well-formed shard', async () => {
    expect(await main(['check', '--tier', 'fast', '--shard', '1/3'], {}, dir, captureIo().io)).toBe(0);
  });

  it('refuses an unknown --reporter by name, rather than silently rendering as something else', async () => {
    const cap = captureIo();

    expect(await main(['check', '--tier', 'fast', '--reporter', 'sarif'], {}, dir, cap.io)).toBe(2);
    expect(cap.err()).toContain('unknown reporter "sarif"');
  });

  it('renders GitHub annotations when asked', async () => {
    const cap = captureIo();
    await main(['check', '--tier', 'fast', '--reporter', 'github'], {}, dir, cap.io);

    expect(cap.out()).toContain('::group::a');
  });

  it('renders GitHub annotations in Actions without being asked', async () => {
    const cap = captureIo();
    await main(['check', '--tier', 'fast'], { GITHUB_ACTIONS: 'true' }, dir, cap.io);

    expect(cap.out()).toContain('::group::a');
  });

  it('but an explicit --reporter beats the environment, for debugging a workflow by eye', async () => {
    const cap = captureIo();
    await main(['check', '--tier', 'fast', '--reporter', 'tty'], { GITHUB_ACTIONS: 'true' }, dir, cap.io);

    expect(cap.out()).toContain('▶ a — a');
    expect(cap.out()).not.toContain('::group::');
  });
});
