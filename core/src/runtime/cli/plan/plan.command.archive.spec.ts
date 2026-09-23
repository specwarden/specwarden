import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IProcessRunner } from '../../../domain';
import { planStatus } from './plan.command';

/**
 * `plan archive` is the harvest GATE. It never moves the file: it refuses (2) until
 * the plan says what moved where and every destination exists, then says the move is
 * the operator's. A gate that let a plan through on "harvested: yes" would be a claim
 * nobody can falsify — the failure this product is named after.
 */

const noSpawn: IProcessRunner = {
  run: () => {
    throw new Error('archive runs no acceptance command');
  },
};

describe('plan archive', () => {
  let dir: string;
  let out: string;
  let err: string;
  const io = { out: (t: string) => (out += t), err: (t: string) => (err += t) };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spw-archive-'));
    mkdirSync(join(dir, 'plans'));
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs', 'ARCHITECTURE.md'), '# arch');
    out = '';
    err = '';
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const HEADER = [
    '**Started:** 2026-09-01',
    '**Finished:** 2026-09-20',
    '**Branch:** feat-x',
    '**Harvested:** below',
    '**Left open:** nothing',
  ];
  const plan = (...lines: string[]) =>
    writeFileSync(join(dir, 'plans', 'p.md'), ['**Status:** done', ...HEADER, '', ...lines].join('\n'));

  it('reports ready, exits 0 and names the move, when every harvest destination resolves', async () => {
    plan('## Harvest', '- the retry decision → docs/ARCHITECTURE.md');
    expect(await planStatus(['plan', 'archive', 'plans/p.md'], dir, io, noSpawn)).toBe(0);
    expect(out).toContain(
      '✅ plans/p.md is ready to archive — harvest declared, every destination resolves, and the header carries ' +
        '**Started:**, **Finished:**, **Branch:**, **Harvested:**, **Left open:**.',
    );
    expect(out).toContain('git mv plans/p.md plans-archive/');
    expect(err).toBe('');
  });

  it('refuses a plan with no harvest section, and says what archiving requires', async () => {
    plan('## Phase 1 — a', '**Acceptance.** true');
    expect(await planStatus(['plan', 'archive', 'plans/p.md'], dir, io, noSpawn)).toBe(2);
    expect(err).toContain('❌ plans/p.md is not ready to archive:');
    expect(err).toContain('• no Harvest section');
    expect(out).toBe('');
  });

  it('refuses a plan lacking the archive header, and names the fields to add', async () => {
    // "Ready" over a plan with no header, and the archived entry was then refused by the
    // plans module for exactly that: advice that, followed literally, turned the run red.
    writeFileSync(
      join(dir, 'plans', 'p.md'),
      ['**Status:** done', '', '## Harvest', '- a → docs/ARCHITECTURE.md'].join('\n'),
    );
    expect(await planStatus(['plan', 'archive', 'plans/p.md'], dir, io, noSpawn)).toBe(2);
    expect(err).toContain(
      '• the archive header is missing **Started:**, **Finished:**, **Branch:**, **Harvested:**, **Left open:**',
    );
    expect(out).toBe('');
  });

  it('refuses a bare "harvested: yes", which names nothing that could be checked', async () => {
    plan('## Harvest', 'harvested: yes');
    expect(await planStatus(['plan', 'archive', 'plans/p.md'], dir, io, noSpawn)).toBe(2);
    expect(err).toContain('"harvested: yes" is not accepted');
  });

  it('refuses a destination that does not exist, naming every one rather than the first', async () => {
    plan('## Harvest', '- a → docs/GONE.md', '- b → docs/ALSO-GONE.md');
    expect(await planStatus(['plan', 'archive', 'plans/p.md'], dir, io, noSpawn)).toBe(2);
    expect(err).toContain('"docs/GONE.md" does not exist');
    expect(err).toContain('"docs/ALSO-GONE.md" does not exist');
  });
});
