import { describe, expect, it } from 'vitest';

import type { ICheckContext, IVerdict } from 'specwarden';
import { InMemoryFileSource } from 'specwarden';
import { planShape } from './plan-shape.check';

const ID = { id: 'plan-shape', title: 'plan shape', tier: 'fast' as const };
const NAME_RE = /^(?:[A-Z][A-Z0-9]*-\d+-)?[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const SIZING = [/\d+\s*(?:h|hours?|hrs?)\b/iu, /story\s*points?/iu];
const PHASE_RE = /^(#{2,4})\s+(?:Phase|Фаза)\b/i;
const COMMAND_RE = /\b(pnpm|npx|node|vitest|jest)\b/;

function run(files: Record<string, string>, opts: Partial<Parameters<typeof planShape>[0]> = {}): IVerdict {
  // The plans directory listing: entries are the basenames; a value of null marks a directory.
  const source = new InMemoryFileSource(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v ?? ''])));
  const check = planShape({
    ...ID,
    plansDir: 'docs/_plans',
    nameRe: NAME_RE,
    allowedNonPlans: ['README.md'],
    sizingPatterns: SIZING,
    phaseHeadingRe: PHASE_RE,
    commandRe: COMMAND_RE,
    knownGateIds: ['doc-paths', 'router-mirror'],
    ...opts,
  });
  return check.run({ changed: [], files: source } as unknown as ICheckContext) as IVerdict;
}

describe('planShape', () => {
  it('is a product-zone check', () => {
    expect(
      planShape({
        ...ID,
        plansDir: 'p',
        nameRe: NAME_RE,
        sizingPatterns: [],
        phaseHeadingRe: PHASE_RE,
        commandRe: COMMAND_RE,
        knownGateIds: [],
      }).zone,
    ).toBe('product');
  });

  it('accepts a well-formed plan', () => {
    const v = run({
      'docs/_plans/MINIAPP-9-thing.md': '## Phase 1\nrun `pnpm gate --id doc-paths`\n',
      'docs/_plans/README.md': '',
    });
    expect(v.ok).toBe(true);
  });

  it('fails a plan named off-convention', () => {
    const v = run({ 'docs/_plans/BadName.md': '## Phase 1\n`pnpm x`\n' });
    expect(v.ok).toBe(false);
    expect(v.findings.some((f) => f.message.includes('name must match'))).toBe(true);
  });

  it('fails a plan naming a gate id that does not exist', () => {
    const v = run({ 'docs/_plans/a-b.md': '## Phase 1\n`pnpm gate --id nonesuch`\n' });
    expect(v.ok).toBe(false);
    expect(v.findings.some((f) => f.message.includes('not a known check'))).toBe(true);
  });

  it('ratchets work-sizing mentions', () => {
    const files = { 'docs/_plans/a-b.md': '## Phase 1\ntakes 3 hours\n`pnpm x`\n' };
    expect(run(files, { sizingRatchet: 1 }).ok).toBe(true);
    expect(run(files, { sizingRatchet: 0 }).ok).toBe(false);
  });

  it('ratchets a phase with no acceptance command', () => {
    const files = { 'docs/_plans/a-b.md': '## Phase 1 — wire the FE\njust prose, nothing runnable\n' };
    expect(run(files, { unacceptedRatchet: 1 }).ok).toBe(true);
    expect(run(files, { unacceptedRatchet: 0 }).ok).toBe(false);
  });

  it('passes vacuously (info, not failure) when the plans dir is absent', () => {
    const v = run({ 'other/x.md': '' }, { plansDir: 'nope' });
    expect(v.ok).toBe(true);
  });
});
