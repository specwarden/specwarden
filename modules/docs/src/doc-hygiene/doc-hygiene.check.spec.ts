import { describe, expect, it } from 'vitest';

import type { ICheckContext, IVerdict } from 'specwarden';
import { InMemoryFileSource } from 'specwarden';
import { docHygiene } from './doc-hygiene.check';

const ID = { id: 'doc-hygiene', title: 'hygiene', tier: 'fast' as const };

function run(files: Record<string, string>, opts: Partial<Parameters<typeof docHygiene>[0]> = {}): IVerdict {
  const source = new InMemoryFileSource(files);
  const tracked = Object.keys(files).filter((f) => f.endsWith('.md'));
  const check = docHygiene({ ...ID, docs: '*.md', fatCellLimit: 40, ...opts });
  const ctx = { changed: [], files: source, vcs: { trackedFiles: () => tracked } } as unknown as ICheckContext;
  return check.run(ctx) as IVerdict;
}

describe('docHygiene', () => {
  it('is a product-zone check', () => {
    expect(docHygiene({ ...ID, docs: '*.md' }).zone).toBe('product');
  });

  it('flags a relative link to a file that does not exist', () => {
    const v = run({ 'docs/a.md': 'see [x](./gone.md) here' });
    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('gone.md');
  });

  it('accepts a relative link that resolves', () => {
    expect(run({ 'docs/a.md': 'see [x](./b.md)', 'docs/b.md': '# b' }).ok).toBe(true);
  });

  it('flags a pointer into a MOVED section stub', () => {
    const files = {
      'A.md': 'per `B.md` §5 the rule holds',
      'B.md': '## 5. Beacon endpoints — MOVED to humanity-scoring\n',
    };
    const v = run(files);
    expect(v.ok).toBe(false);
    expect(v.findings.some((f) => f.message.includes('MOVED stub'))).toBe(true);
  });

  it('accepts a pointer into a live section', () => {
    expect(run({ 'A.md': 'per `B.md` §5', 'B.md': '## 5. Beacon endpoints\n' }).ok).toBe(true);
  });

  it('ratchets fat table cells (a row over the limit) and fails on excess', () => {
    const fat = { 'a.md': `| ${'x'.repeat(60)} | y |\n` };
    expect(run(fat, { ratchet: 1 }).ok).toBe(true);
    expect(run(fat, { ratchet: 0 }).ok).toBe(false);
  });

  it('does not count a fat line inside a code fence', () => {
    const v = run({ 'a.md': '```\n' + `| ${'x'.repeat(60)} | y |\n` + '```\n' }, { ratchet: 0 });
    expect(v.ok).toBe(true);
  });

  it('skips a rendered source so its cells are not counted twice', () => {
    const fat = `| ${'x'.repeat(60)} | y |\n`;
    expect(run({ 'overlay.md': fat }, { ratchet: 0, renderedSources: ['overlay.md'] }).ok).toBe(true);
  });
});
