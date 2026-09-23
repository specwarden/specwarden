import { describe, expect, it } from 'vitest';

import { type IVerdict, errorsOf, runCheck } from 'specwarden';
import { decisionLogShape } from './decision-log-shape.check';

const ID = { id: 'decision-log-shape', title: 'decisions state why', tier: 'fast' as const };

const run = (tree: Record<string, string>, docs = '**/*.md', tracked?: readonly string[]): Promise<IVerdict> =>
  runCheck(decisionLogShape({ ...ID, docs }), { tree, tracked });

describe('decisionLogShape', () => {
  it('is a product-zone check', () => {
    expect(decisionLogShape({ ...ID, docs: '**/*.md' }).zone).toBe('product');
  });

  it('passes when every rejection carries a reason', async () => {
    expect((await run({ 'p.md': '### Decision: x\n- Rejected: y — a real reason\n' })).ok).toBe(true);
  });

  it('flags a rejection with no reason, at the line of the decision it belongs to', async () => {
    const v = await run({ 'docs/p.md': '# plan\n\n### Decision: cache the result\n- Rejected: recompute\n' });

    expect(v.ok).toBe(false);
    // The DECISION's line: the reason is written under the decision, so that is where a
    // reader starts, whichever of its alternatives lacks one.
    expect(v.findings[0]).toMatchObject({ file: 'docs/p.md', line: 3 });
    expect(errorsOf(v)).toEqual([
      'docs/p.md:3 — decision "cache the result" rejects "recompute" with no reason. State why: a rejection without a reason is the fact that gets lost.',
    ]);
  });

  it('reports every unreasoned rejection across the corpus, not only the first', async () => {
    const tree = {
      'a.md': '### Decision: x\n- Rejected: y\n',
      'b.md': '### Decision: z\n- Rejected: w\n- Rejected: v — too slow\n',
    };

    expect(errorsOf(await run(tree))).toHaveLength(2);
  });

  it('holds unreasoned rejections under a ratchet', async () => {
    const tree = { 'a.md': '### Decision: x\n- Rejected: y\n' };
    const check = decisionLogShape({ ...ID, docs: '**/*.md', ratchet: 1 });

    expect((await runCheck(check, { tree })).ok).toBe(true);
    expect((await runCheck(check, { tree, ratchet: 0 })).ok).toBe(false);
  });

  it('ignores a document with no decision log', async () => {
    expect((await run({ 'p.md': '# just a plan\nsome prose\n' })).ok).toBe(true);
  });

  it('reads only the documents the pathspec selects', async () => {
    const tree = { 'docs/_plans/a.md': '# fine', 'vendor/b.md': '### Decision: x\n- Rejected: y\n' };

    expect((await run(tree, 'docs/**/*.md')).ok).toBe(true);
  });

  it('skips a tracked document the file source cannot read, rather than crashing', async () => {
    expect((await run({ 'a.md': '# a' }, '**/*.md', ['a.md', 'deleted.md'])).ok).toBe(true);
  });

  it('fails, naming the pathspec, when no document matched — zero documents is not a clean run', async () => {
    const v = await run({ 'src/index.ts': '' }, 'docs/_plans/*.md');

    expect(v.ok).toBe(false);
    expect(errorsOf(v)[0]).toContain('no document matched `docs/_plans/*.md`');
  });
});

describe('decisionLogShape — its defaults and options', () => {
  it('reads the plans in `docs/_plans` in the fast tier when nothing is said', async () => {
    const check = decisionLogShape({ id: 'decision-log-shape', title: 't' });
    const tree = {
      'docs/_plans/a.md': '### Decision: x\n- Rejected: y\n',
      'docs/other.md': '### Decision: z\n- Rejected: w\n',
    };

    expect(check.tier).toBe('fast');
    expect(errorsOf(await runCheck(check, { tree }))).toEqual([
      'docs/_plans/a.md:1 — decision "x" rejects "y" with no reason. State why: a rejection without a reason is the fact that gets lost.',
    ]);
  });

  it('refuses an option it does not have, by name', () => {
    expect(() => decisionLogShape({ ...ID, doc: 'x' } as never)).toThrow('`doc` is not an option of decisionLogShape');
  });
});
