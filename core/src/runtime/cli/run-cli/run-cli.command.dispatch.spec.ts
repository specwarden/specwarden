import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
 * The commands a repository runs BEFORE it has a config, reached through `main`. The
 * invariant every one of them shares: it must work on a raw repository — a
 * dispatcher that looked for a config first would make `init` refuse to run in
 * exactly the place it exists for.
 */
describe('dispatch on a repository with no config', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spw-dispatch-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('init writes the starting tree into the working directory', async () => {
    const cap = captureIo();
    expect(await main(['init'], {}, dir, cap.io)).toBe(0);
    expect(existsSync(join(dir, '.specwarden', 'warden.config.mjs'))).toBe(true);
    expect(existsSync(join(dir, '.specwarden', 'rules.mjs'))).toBe(true);
    expect(cap.out()).toContain('specwarden init — wrote .specwarden/');
  });

  it('init forwards --template, and an unknown one leaves the directory untouched', async () => {
    const cap = captureIo();
    expect(await main(['init', '--template', 'never-published'], {}, dir, cap.io)).toBe(2);
    expect(cap.err()).toContain('@specwarden/template-never-published');
    expect(existsSync(join(dir, '.specwarden'))).toBe(false);
  });

  it('a second init refuses and leaves the first config byte-identical', async () => {
    await main(['init'], {}, dir, captureIo().io);
    const config = join(dir, '.specwarden', 'warden.config.mjs');
    writeFileSync(config, '// edited by hand\nexport default {};\n');
    const cap = captureIo();
    expect(await main(['init'], {}, dir, cap.io)).toBe(2);
    expect(readFileSync(config, 'utf8')).toBe('// edited by hand\nexport default {};\n');
    expect(cap.err()).toContain('already exists');
  });

  it('new scaffolds the check and its test under the consumer folder, in the named family', async () => {
    const cap = captureIo();
    expect(await main(['new', 'doc-links', '--family', 'docs'], {}, dir, cap.io)).toBe(0);
    const unit = join(dir, '.specwarden', 'checks', 'docs', 'doc-links');
    expect(existsSync(join(unit, 'doc-links.check.mjs'))).toBe(true);
    expect(existsSync(join(unit, 'doc-links.check.test.mjs'))).toBe(true);
    expect(cap.out()).toContain('specwarden check --id doc-links');
  });

  it('new, run from a nested directory, writes at the repository root the config marks', async () => {
    // Otherwise the check lands in `packages/a/.specwarden/checks/`, where the engine —
    // which reads from the root — never discovers it.
    mkdirSync(join(dir, '.specwarden'));
    writeFileSync(join(dir, '.specwarden', 'warden.config.mjs'), 'export default {};');
    const nested = join(dir, 'packages', 'a');
    mkdirSync(nested, { recursive: true });
    expect(await main(['new', 'x-check'], {}, nested, captureIo().io)).toBe(0);
    const written = join(dir, '.specwarden', 'checks');
    expect(existsSync(written)).toBe(true);
    expect(existsSync(join(nested, '.specwarden'))).toBe(false);
  });

  it('new without an id is a usage error', async () => {
    const cap = captureIo();
    expect(await main(['new'], {}, dir, cap.io)).toBe(2);
    expect(cap.err()).toContain('usage: specwarden new <check-id>');
  });

  it('perimeter allows (0) when nothing is declared — the hook must never block a repository with no rules', async () => {
    expect(await main(['perimeter'], {}, dir, captureIo().io)).toBe(0);
  });

  it('plan reaches the plan lifecycle with the argv as typed', async () => {
    writeFileSync(join(dir, 'p.md'), '**Status:** active\n\n## Phase 1 — a\n**Acceptance.** true\n');
    const cap = captureIo();
    expect(await main(['plan', 'status', 'p.md'], {}, dir, cap.io)).toBe(0);
    expect(cap.out()).toContain('• a — true');
  });
});

describe('the usage text', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spw-usage-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it.each([[[]], [['chekc']], [['--tier', 'fast']]])('is printed on stderr with exit 2 for argv %j', async (argv) => {
    // Exit 2, not 0: a CI step that typo'd its command must not go green by printing help.
    const cap = captureIo();
    expect(await main(argv, {}, dir, cap.io)).toBe(2);
    expect(cap.err()).toContain('usage: specwarden <command>');
    expect(cap.out()).toBe('');
  });

  it('names every command the dispatcher actually reaches', async () => {
    const cap = captureIo();
    await main([], {}, dir, cap.io);
    for (const command of [
      'adopt',
      'suggest',
      'init',
      'check',
      'new',
      'doctor',
      'plan',
      'sync-invariants',
      'migrate',
      'perimeter',
    ])
      expect(cap.err()).toMatch(new RegExp(`^ {4}${command} `, 'm'));
  });

  it('is checked before any config is looked for — a typo is not reported as a missing config', async () => {
    const cap = captureIo();
    await main(['chekc'], {}, dir, cap.io);
    expect(cap.err()).not.toContain('nothing to run');
  });
});
