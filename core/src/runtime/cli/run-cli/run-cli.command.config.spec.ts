import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ICliIo } from '../../../index';
import { main } from './run-cli.command';

function captureIo(): { io: ICliIo; out: () => string; err: () => string } {
  let out = '';
  let err = '';
  return { io: { out: (t) => (out += t), err: (t) => (err += t) }, out: () => out, err: () => err };
}

/**
 * Everything between "a config was found" and "a command ran": loading it, the version
 * guard, and assembling the tree. Each refusal here is exit 2 with a sentence, because
 * the alternative for every one of them is a run over a roster that is not the one the
 * repository declared — and that run reports green.
 *
 * Configs are plain objects so the temp directory, outside the workspace, needs no
 * import of the engine.
 */
describe('main, once a config is found', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spw-cfg-'));
    mkdirSync(join(dir, '.specwarden'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const config = (body: string) => writeFileSync(join(dir, '.specwarden', 'warden.config.mjs'), body);
  const checkFile = (rel: string, body: string) => {
    const abs = join(dir, '.specwarden', 'checks', rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, body);
  };

  describe('a config that is not a config', () => {
    it.each([
      ['no default export', 'export const config = {};'],
      ['a default that is not an object', 'export default 42;'],
    ])('refuses %s with 2 and says what the file must export', async (_what, body) => {
      config(body);
      const cap = captureIo();
      expect(await main(['check', '--all'], {}, dir, cap.io)).toBe(2);
      expect(cap.err()).toContain('must default-export a config object (see defineConfig)');
    });
  });

  describe('the version guard', () => {
    it('migrate says a config with no version is current', async () => {
      config('export default {};');
      const cap = captureIo();
      expect(await main(['migrate'], {}, dir, cap.io)).toBe(0);
      expect(cap.out()).toContain('config is at version 1, the current version — nothing to migrate.');
    });

    it('migrate refuses a config newer than the engine, and says to upgrade', async () => {
      config('export default { version: 2 };');
      const cap = captureIo();
      expect(await main(['migrate'], {}, dir, cap.io)).toBe(2);
      expect(cap.err()).toContain('config declares version 2, newer than this engine (v1). Upgrade specwarden.');
    });

    it('migrate refuses a version older than any there has been — exit 2, never a zero over nothing done', async () => {
      // It exited 0 with "no migration to v1 is defined yet": a migration that did not
      // happen, from a version that never existed, reading as done.
      config('export default { version: 0 };');
      const cap = captureIo();
      expect(await main(['migrate'], {}, dir, cap.io)).toBe(2);
      expect(cap.err()).toBe(
        'config declares version 0, which no engine ever spoke — the first config version is 1. Set `version: 1`, or remove the key.\n',
      );
      expect(cap.out()).toBe('');
    });

    it.each([['doctor'], ['sync-invariants'], ['check']])(
      '%s refuses a config newer than the engine rather than operating on a shape it cannot read',
      async (command) => {
        config('export default { version: 2 };');
        const cap = captureIo();
        expect(await main([command], {}, dir, cap.io)).toBe(2);
        expect(cap.err()).toContain('declares config version 2, but this engine speaks v1');
      },
    );
  });

  describe('sync-invariants', () => {
    it('says there is nothing to sync without a spec source, and exits 0', async () => {
      config('export default {};');
      const cap = captureIo();
      expect(await main(['sync-invariants'], {}, dir, cap.io)).toBe(0);
      expect(cap.out()).toContain('no specSource configured — nothing to sync.');
    });
  });

  describe('assembling the tree', () => {
    it('refuses with 2 a check file that exports no check — a file in checks/ that is silently skipped looks like coverage', async () => {
      config('export default {};');
      checkFile('docs/helper.check.mjs', 'export const notACheck = 1;');
      const cap = captureIo();
      expect(await main(['check', '--all'], {}, dir, cap.io)).toBe(2);
      expect(cap.err()).toContain('.specwarden/checks/docs/helper.check.mjs exports no check');
    });

    it('refuses with 2 a plugin that breaks the plugin contract', async () => {
      config("export default { plugins: [{ name: '' }] };");
      const cap = captureIo();
      expect(await main(['doctor'], {}, dir, cap.io)).toBe(2);
      expect(cap.err()).toContain('a plugin must declare a non-empty name.');
    });

    it('a check file that throws on import is a load error — exit 2, the file named, no stack', async () => {
      // It crashed the CLI with a raw stack and exit 1, the code a red gate uses.
      config('export default {};');
      checkFile('broken.check.mjs', "throw new Error('broken at import');");
      const cap = captureIo();
      expect(await main(['check', '--all'], {}, dir, cap.io)).toBe(2);
      expect(cap.err()).toBe('.specwarden/checks/broken.check.mjs failed to load: broken at import\n');
    });

    it('runs a check discovered in the tree, and says how many it discovered', async () => {
      config('export default {};');
      checkFile(
        'docs/found.check.mjs',
        `export const check = { id: 'found', title: 'found', tier: 'fast', zone: 'consumer', capabilities: [], contractVersion: 1, when: () => true, run: () => ({ ok: true, findings: [] }) };`,
      );
      const cap = captureIo();
      expect(await main(['check', '--list'], {}, dir, cap.io)).toBe(0);
      expect(cap.out()).toContain('found\tfound\n');
      expect(cap.err()).toContain('ℹ discovered 1 check(s) in 1 file(s) under .specwarden/checks/');
    });

    it('prints the tree notes for a question about the roster, never on a run', async () => {
      config('export default { harness: false };');
      const run = captureIo();
      await main(['check', '--all'], {}, dir, run.io);
      expect(run.err()).not.toContain('ℹ');

      const doctor = captureIo();
      await main(['doctor'], {}, dir, doctor.io);
      expect(doctor.err()).toContain('ℹ harness self-checks disabled entirely (config.harness = false)');
    });

    it('prints the tree notes on stderr, and none under --json, whose consumer is a machine', async () => {
      config('export default { harness: false };');
      const plain = captureIo();
      await main(['check', '--list'], {}, dir, plain.io);
      expect(plain.err()).toContain('ℹ harness self-checks disabled entirely (config.harness = false)');

      const json = captureIo();
      await main(['check', '--list', '--json'], {}, dir, json.io);
      expect(json.err()).toBe('');
    });
  });

  describe('doctor reads the ASSEMBLED register', () => {
    it('prints no coverage when the config declares no register — the audits are off, not failing', async () => {
      config(
        `export default { checks: [{ id: 'a', title: 'a', tier: 'fast', zone: 'consumer', capabilities: [], contractVersion: 1, when: () => true, run: () => ({ ok: true, findings: [] }) }] };`,
      );
      const cap = captureIo();
      expect(await main(['doctor'], {}, dir, cap.io)).toBe(0);
      expect(cap.out()).toContain('a\tfast\tconsumer\t[—]\ta\n');
      expect(cap.out()).not.toContain('rule coverage');
    });
  });
});
