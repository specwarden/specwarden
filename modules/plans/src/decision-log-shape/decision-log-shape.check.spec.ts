import { describe, expect, it } from 'vitest';

import type { ICheckContext, IVerdict } from 'specwarden';
import { InMemoryFileSource } from 'specwarden';
import { decisionLogShape } from './decision-log-shape.check';

const ID = { id: 'decision-log-shape', title: 'decisions state why', tier: 'fast' as const };

function run(files: Record<string, string>): IVerdict {
  const source = new InMemoryFileSource(files);
  const tracked = Object.keys(files).filter((f) => f.endsWith('.md'));
  const check = decisionLogShape({ ...ID, docs: '*.md' });
  const ctx = { changed: [], files: source, vcs: { trackedFiles: () => tracked } } as unknown as ICheckContext;
  return check.run(ctx) as IVerdict;
}

describe('decisionLogShape', () => {
  it('is a product-zone check', () => {
    expect(decisionLogShape({ ...ID, docs: '*.md' }).zone).toBe('product');
  });

  it('passes when every rejection carries a reason', () => {
    expect(run({ 'p.md': '### Decision: x\n- Rejected: y — a real reason\n' }).ok).toBe(true);
  });

  it('flags a rejection with no reason', () => {
    const v = run({ 'p.md': '### Decision: x\n- Rejected: y\n' });
    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('no reason');
  });

  it('ignores a document with no decision log', () => {
    expect(run({ 'p.md': '# just a plan\nsome prose\n' }).ok).toBe(true);
  });
});
