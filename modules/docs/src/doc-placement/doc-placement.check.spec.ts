import { describe, expect, it } from 'vitest';

import { type IVerdict, errorsOf, runCheck } from 'specwarden';
import { docPlacement } from './doc-placement.check';

const ID = { id: 'doc-placement', title: 'placement', tier: 'fast' as const };
const ALLOWED = [/^(AGENTS|CLAUDE)\.md$/, /(^|\/)README\.md$/, /^docs\/_plans\/[^/]+\.md$/];
const LINK = { pattern: /_plans\/([\w.-]+)\.md/, dir: 'docs/_plans/', allow: 'README' };

const run = (
  tree: Record<string, string>,
  opts: Partial<Parameters<typeof docPlacement>[0]> = {},
  tracked?: readonly string[],
): Promise<IVerdict> =>
  runCheck(docPlacement({ ...ID, docs: '**/*.md', allowed: ALLOWED, ...opts }), { tree, tracked });

describe('docPlacement — the contract', () => {
  it('is a product-zone check', () => {
    expect(docPlacement({ ...ID, docs: '**/*.md', allowed: ALLOWED }).zone).toBe('product');
  });

  it('accepts a file the contract describes', async () => {
    expect((await run({ 'AGENTS.md': '', 'docs/_plans/p.md': '' })).ok).toBe(true);
  });

  it('flags a file in an undescribed location, and says both ways out', async () => {
    const v = await run({ 'random/place.md': '' });

    expect(v.ok).toBe(false);
    expect(v.findings[0]).toMatchObject({ file: 'random/place.md' });
    expect(errorsOf(v)[0]).toContain('move it, or add the row to the contract');
  });

  it('matches a global contract regex the same way on every file', async () => {
    // A `/g` regex keeps `lastIndex` between calls; tested statefully, every second file
    // matching it would be reported as undescribed.
    const v = await run({ 'a/README.md': '', 'b/README.md': '', 'c/README.md': '' }, { allowed: [/README\.md$/g] });

    expect(v.ok).toBe(true);
  });

  it('holds placement offenders under a ratchet, and frames the tolerated set', async () => {
    const tree = { 'a/x.md': '', 'b/y.md': '' };
    const held = await run(tree, { ratchet: 2 });

    expect(held.ok).toBe(true);
    // The two offenders are still listed, under a line saying they are tolerated — so
    // the green verdict is not printed above what reads like two failures.
    expect(held.findings[0].message).toContain('tolerated under the placement ratchet 2');
    expect(errorsOf(held)).toHaveLength(2);
    expect((await run(tree, { ratchet: 1 })).ok).toBe(false);
  });
});

describe('docPlacement — the inbound-link ban', () => {
  it('bans an inbound link into the plan folder from outside it, regardless of ratchet', async () => {
    const v = await run({ 'AGENTS.md': 'see `docs/_plans/PLAT-9.md`' }, { link: LINK, ratchet: 10 });

    expect(v.ok).toBe(false);
    expect(errorsOf(v)[0]).toContain('links into docs/_plans/ (`PLAT-9`)');
  });

  it('reports every inbound link on a line, not only the first — a non-global pattern is widened', async () => {
    const v = await run({ 'AGENTS.md': 'see docs/_plans/a.md and docs/_plans/b.md' }, { link: LINK });

    expect(errorsOf(v)).toHaveLength(2);
  });

  it('takes an already-global pattern as it is', async () => {
    const link = { ...LINK, pattern: /_plans\/([\w.-]+)\.md/g };
    const v = await run({ 'AGENTS.md': 'see docs/_plans/a.md and docs/_plans/b.md' }, { link });

    expect(errorsOf(v)).toHaveLength(2);
  });

  it('exempts the plan folder itself and the allowed README target', async () => {
    const tree = { 'docs/_plans/a.md': 'see docs/_plans/b.md', 'AGENTS.md': 'see docs/_plans/README.md' };

    expect((await run(tree, { link: LINK })).ok).toBe(true);
  });

  it('skips a tracked document the file source cannot read, rather than crashing', async () => {
    const v = await run({ 'AGENTS.md': '' }, { link: LINK }, ['AGENTS.md', 'CLAUDE.md']);

    expect(v.ok).toBe(true);
  });
});

describe('docPlacement — what it examined', () => {
  it('fails, naming the pathspec, when no document matched', async () => {
    const v = await run({ 'src/index.ts': '' }, { docs: 'docs/**/*_MODULE.md' });

    expect(v.ok).toBe(false);
    expect(errorsOf(v)[0]).toContain('no document matched `docs/**/*_MODULE.md`');
  });
});
