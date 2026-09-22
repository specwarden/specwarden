import { describe, expect, it } from 'vitest';

import type { ICheckContext, IVerdict } from 'specwarden';
import { InMemoryFileSource } from 'specwarden';
import { docPlacement } from './doc-placement.check';

const ID = { id: 'doc-placement', title: 'placement', tier: 'fast' as const };
const ALLOWED = [/^(AGENTS|CLAUDE)\.md$/, /(^|\/)README\.md$/, /^docs\/_plans\/[^/]+\.md$/];

function run(files: Record<string, string>, opts: Partial<Parameters<typeof docPlacement>[0]> = {}): IVerdict {
  const source = new InMemoryFileSource(files);
  const tracked = Object.keys(files).filter((f) => f.endsWith('.md'));
  const check = docPlacement({ ...ID, docs: '*.md', allowed: ALLOWED, ...opts });
  const ctx = { changed: [], files: source, vcs: { trackedFiles: () => tracked } } as unknown as ICheckContext;
  return check.run(ctx) as IVerdict;
}

describe('docPlacement', () => {
  it('is a product-zone check', () => {
    expect(docPlacement({ ...ID, docs: '*.md', allowed: ALLOWED }).zone).toBe('product');
  });

  it('accepts a file the contract describes', () => {
    expect(run({ 'AGENTS.md': '', 'docs/_plans/p.md': '' }).ok).toBe(true);
  });

  it('flags a file in an undescribed location', () => {
    const v = run({ 'random/place.md': '' });
    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('random/place.md');
  });

  it('holds placement offenders under a ratchet', () => {
    expect(run({ 'a/x.md': '', 'b/y.md': '' }, { ratchet: 2 }).ok).toBe(true);
    expect(run({ 'a/x.md': '', 'b/y.md': '' }, { ratchet: 1 }).ok).toBe(false);
  });

  it('bans an inbound link into the plan folder from outside it, regardless of ratchet', () => {
    const link = { pattern: /_plans\/([\w.-]+)\.md/, dir: 'docs/_plans/', allow: 'README' };
    const v = run({ 'AGENTS.md': 'see `docs/_plans/MINIAPP-9.md`' }, { link });
    expect(v.ok).toBe(false);
    expect(v.findings.some((f) => f.message.includes('links into docs/_plans/'))).toBe(true);
  });

  it('exempts the plan folder itself and the allowed README target', () => {
    const link = { pattern: /_plans\/([\w.-]+)\.md/, dir: 'docs/_plans/', allow: 'README' };
    expect(
      run({ 'docs/_plans/a.md': 'see docs/_plans/b.md', 'AGENTS.md': 'see docs/_plans/README.md' }, { link }).ok,
    ).toBe(true);
  });
});
