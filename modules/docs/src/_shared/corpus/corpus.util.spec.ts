import { describe, expect, it } from 'vitest';

import { errorsOf, testContext } from 'specwarden';
import { corpusOf, debtVerdict, refusedCorpus } from './corpus.util';

const vcs = (tree: Record<string, string>) => testContext({ tree }).vcs;

describe('corpusOf', () => {
  it('joins several pathspecs, leaves out what `except` selects, and says how many matched before it', () => {
    const corpus = corpusOf(
      vcs({ 'b.md': '', 'a.md': '', 'docs/_archive/x.md': '', 'src/a.ts': '' }),
      ['*.md', 'docs/**/*.md'],
      ['docs/_archive'],
    );

    expect(corpus).toEqual({ files: ['a.md', 'b.md'], matched: 3 });
  });
});

describe('refusedCorpus', () => {
  it('is a FAILING verdict naming the pathspec — an empty corpus must never read as a clean run', () => {
    const verdict = refusedCorpus('doc-paths', 'handbook/**/*.md', { files: [], matched: 0 }, undefined);

    expect(verdict?.ok).toBe(false);
    expect(errorsOf(verdict!)[0]).toContain('examined 0 document(s) — `handbook/**/*.md` matched nothing to read');
    expect(verdict!.findings[0]).toMatchObject({ ruleId: 'doc-paths' });
  });

  it('says when `except` emptied a corpus the pathspec had filled', () => {
    const verdict = refusedCorpus('doc-symbols', ['src/**/*.ts'], { files: [], matched: 2 }, undefined, 'code file');

    expect(errorsOf(verdict!)[0]).toContain(
      'examined 0 code file(s) — `src/**/*.ts` matched 2 file(s), and `except` exempted all of them',
    );
  });

  it('holds when the corpus reaches the floor, and a floor of 0 accepts an empty corpus', () => {
    expect(refusedCorpus('x', '**/*.md', { files: ['a.md'], matched: 1 }, undefined)).toBeUndefined();
    expect(refusedCorpus('x', '**/*.md', { files: [], matched: 0 }, { atLeast: 0 })).toBeUndefined();
  });
});

describe('debtVerdict', () => {
  const soft = { severity: 'error' as const, message: 'soft.' };
  const hard = { severity: 'error' as const, message: 'hard.' };
  const pass = { id: 'x', examined: 3 };

  it('holds soft findings up to the bar, frames them as tolerated, and states the count it measured', () => {
    const verdict = debtVerdict({ hard: [], soft: [soft, soft] }, { threshold: 2 }, pass);

    expect(verdict.ok).toBe(true);
    expect(verdict.measured).toBe(2);
    expect(verdict.findings[0].message).toContain('2 pre-existing violation(s) tolerated under ratchet 2');
  });

  it('fails on one soft finding past the bar, and on any hard finding whatever the bar', () => {
    expect(debtVerdict({ hard: [], soft: [soft, soft] }, { threshold: 1 }, pass).ok).toBe(false);
    expect(debtVerdict({ hard: [hard], soft: [] }, { threshold: 9 }, pass).ok).toBe(false);
  });

  it('prints the engine’s pass line over a clean corpus, and keeps its notes', () => {
    const note = { severity: 'info' as const, message: 'a note.' };
    const verdict = debtVerdict({ hard: [], soft: [], notes: [note] }, { threshold: 0 }, pass);

    expect(verdict.findings.map((f) => f.message)).toEqual(['✓ x — 3 file(s) examined, clean', 'a note.']);
  });
});
