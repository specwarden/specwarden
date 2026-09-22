import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ICliIo } from '../cli';
import type { IProcessRunner } from '../../../domain';
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

describe('plan status', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spw-plan-'));
    writeFileSync(join(dir, 'plan.md'), PLAN);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('lists phases and their acceptance without --verify', async () => {
    const cap = captureIo();
    const code = await planStatus(['plan', 'status', 'plan.md'], dir, cap.io);
    expect(code).toBe(0);
    expect(cap.out()).toContain('• green thing — true');
    expect(cap.out()).toContain('• red thing — false');
  });

  it('--verify runs each acceptance command and fails when one does', async () => {
    // A fake runner: `true` passes, anything else fails — so the state comes from
    // the command, not the document.
    const proc: IProcessRunner = {
      run: (_c, args) => ({ status: args[args.length - 1] === 'true' ? 0 : 1, stdout: '', stderr: '' }),
    };
    const cap = captureIo();
    const code = await planStatus(['plan', 'status', 'plan.md', '--verify'], dir, cap.io, proc);
    expect(code).toBe(1); // one acceptance command failed
    expect(cap.out()).toContain('✅ green thing');
    expect(cap.out()).toContain('❌ red thing');
  });

  it('rejects a missing file and a bad subcommand', async () => {
    expect(await planStatus(['plan', 'status', 'nope.md'], dir, captureIo().io)).toBe(2);
    expect(await planStatus(['plan', 'bogus'], dir, captureIo().io)).toBe(2);
  });
});
