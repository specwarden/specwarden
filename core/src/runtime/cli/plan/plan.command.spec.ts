import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ICliIo } from '../cli';
import type { IProcessRunner } from '../../../domain';
import { platformShell } from '../../../infrastructure';
import { planStatus } from './plan.command';

function captureIo(): { io: ICliIo; out: () => string; err: () => string } {
  let out = '';
  let err = '';
  return { io: { out: (t) => (out += t), err: (t) => (err += t) }, out: () => out, err: () => err };
}

const PLAN = [
  '**Status:** active',
  '**Branch:** feat-x',
  '',
  '## Phase 1 — green thing',
  '**Acceptance.** true',
  '',
  '## Phase 2 — red thing',
  '**Acceptance.** false',
  '',
].join('\n');

type TCall = { command: string; args: readonly string[]; cwd?: string };

/** A fake runner: `true` passes, anything else fails — so the state comes from the
 * command, not the document. It records every call, so a test can say what ran. */
function fakeProc(): IProcessRunner & { calls: TCall[] } {
  const calls: TCall[] = [];
  return {
    calls,
    run: (command, args, options) => {
      calls.push({ command, args, cwd: options?.cwd });
      return { status: args[args.length - 1] === 'true' ? 0 : 1, stdout: '', stderr: '' };
    },
  };
}

/** A runner that fails the test if anything is spawned. */
const noSpawn: IProcessRunner = {
  run: () => {
    throw new Error('nothing may be spawned without --verify');
  },
};

describe('plan status', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spw-plan-'));
    writeFileSync(join(dir, 'plan.md'), PLAN);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const write = (name: string, lines: string[]) => writeFileSync(join(dir, name), lines.join('\n'));

  it('lists phases and their acceptance without --verify, and runs none of them', async () => {
    const cap = captureIo();
    const code = await planStatus(['plan', 'status', 'plan.md'], dir, cap.io, noSpawn);
    expect(code).toBe(0);
    expect(cap.out()).toContain('plan: plan.md  (status active, branch feat-x)');
    expect(cap.out()).toContain('• green thing — true');
    expect(cap.out()).toContain('• red thing — false');
  });

  it('omits the branch from the header when the plan names none', async () => {
    write('nobranch.md', ['**Status:** draft', '', '## Phase 1 — only', '**Acceptance.** true']);
    const cap = captureIo();
    expect(await planStatus(['plan', 'status', 'nobranch.md'], dir, cap.io, noSpawn)).toBe(0);
    expect(cap.out()).toContain('(status draft)\n');
  });

  it('exits 1 on a plan it cannot fully parse, and prints why above the phases', async () => {
    // A phase with no acceptance command has no definition of done. Listing it as if
    // it were fine would be a status report that cannot fail.
    write('loose.md', ['**Status:** active', '', '## Phase 1 — vague', 'do things']);
    const cap = captureIo();
    expect(await planStatus(['plan', 'status', 'loose.md'], dir, cap.io, noSpawn)).toBe(1);
    expect(cap.out()).toContain('⚠ phase "vague" names no acceptance command');
    expect(cap.out()).toContain('• vague — (no acceptance)');
  });

  it('--verify runs each acceptance command through the shell, in the working directory, and fails when one does', async () => {
    const proc = fakeProc();
    const cap = captureIo();
    const code = await planStatus(['plan', 'status', 'plan.md', '--verify'], dir, cap.io, proc);
    expect(code).toBe(1); // one acceptance command failed
    expect(cap.out()).toContain('✅ green thing — true');
    expect(cap.out()).toContain('❌ red thing — false');
    const shell = platformShell();
    expect(proc.calls).toEqual([
      { command: shell.command, args: [...shell.args, 'true'], cwd: dir },
      { command: shell.command, args: [...shell.args, 'false'], cwd: dir },
    ]);
  });

  it('--verify exits 0 only when every acceptance command passes', async () => {
    write('green.md', [
      '**Status:** active',
      '',
      '## Phase 1 — a',
      '**Acceptance.** true',
      '## Phase 2 — b',
      '**Acceptance.** true',
    ]);
    const cap = captureIo();
    expect(await planStatus(['plan', 'status', 'green.md', '--verify'], dir, cap.io, fakeProc())).toBe(0);
    expect(cap.out()).not.toContain('❌');
  });

  it('--verify still fails a plan whose parse failed, even when every command it could run passed', async () => {
    // Otherwise a phase that LOST its acceptance line would verify green: the one
    // command left passes, and the missing one is simply never run.
    write('half.md', ['**Status:** active', '', '## Phase 1 — a', '**Acceptance.** true', '## Phase 2 — b', 'nothing']);
    const proc = fakeProc();
    expect(await planStatus(['plan', 'status', 'half.md', '--verify'], dir, captureIo().io, proc)).toBe(1);
    expect(proc.calls).toHaveLength(1);
  });

  it('--verify refuses a plan with no acceptance to run — "all passed" over nothing is not a pass', async () => {
    write('bare.md', ['**Status:** active', '', 'No phases yet.']);
    const proc = fakeProc();
    const cap = captureIo();

    expect(await planStatus(['plan', 'status', 'bare.md', '--verify'], dir, cap.io, proc)).toBe(1);
    expect(proc.calls).toHaveLength(0);
    expect(cap.out()).toContain('nothing to verify');
  });

  it('takes the file wherever it sits among the flags', async () => {
    const proc = fakeProc();
    expect(await planStatus(['plan', 'status', '--verify', 'plan.md'], dir, captureIo().io, proc)).toBe(1);
    expect(proc.calls).toHaveLength(2);
  });

  it('resolves the file against the working directory', async () => {
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs', 'p.md'), PLAN);
    const cap = captureIo();
    expect(await planStatus(['plan', 'status', 'docs/p.md'], dir, cap.io, noSpawn)).toBe(0);
    expect(cap.out()).toContain('plan: docs/p.md');
  });
});

describe('plan refuses what it cannot act on, with exit 2 and a usage line', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spw-plan-usage-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('a missing plan file is named', async () => {
    const cap = captureIo();
    expect(await planStatus(['plan', 'status', 'nope.md'], dir, cap.io, noSpawn)).toBe(2);
    expect(cap.err()).toBe('no such plan: nope.md\n');
  });

  it('an unknown or absent subcommand prints the usage', async () => {
    for (const argv of [['plan', 'bogus'], ['plan']]) {
      const cap = captureIo();
      expect(await planStatus(argv, dir, cap.io, noSpawn)).toBe(2);
      expect(cap.err()).toContain('usage: specwarden plan <status|archive> <file> [--verify]');
    }
  });

  it('a subcommand with no file says which subcommand, and offers --verify only where it applies', async () => {
    const status = captureIo();
    expect(await planStatus(['plan', 'status', '--verify'], dir, status.io, noSpawn)).toBe(2);
    expect(status.err()).toBe('usage: specwarden plan status <file> [--verify]\n');

    const archive = captureIo();
    expect(await planStatus(['plan', 'archive'], dir, archive.io, noSpawn)).toBe(2);
    expect(archive.err()).toBe('usage: specwarden plan archive <file>\n');
  });

  it('builds its own process runner when none is handed in', async () => {
    // The default seam is the real one; reaching it must not crash before the
    // argument checks that come first.
    const cap = captureIo();
    expect(await planStatus(['plan', 'status', 'nope.md'], dir, cap.io)).toBe(2);
  });
});
