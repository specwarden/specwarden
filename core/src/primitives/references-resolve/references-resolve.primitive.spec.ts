import { describe, expect, it } from 'vitest';

import { errorsOf, runCheck } from '../../testing';
import { type IReferencesResolveOptions, referencesResolve } from './references-resolve.primitive';

/**
 * References of a shape must resolve. The default resolver is "names a file that
 * exists", so every case below is a tree plus a document that points into it — and
 * the refusing case comes first, because a link checker that has never reported a
 * dead link has told nobody anything.
 */
const ID = { id: 'doc-refs', title: 'doc references resolve', tier: 'fast' as const };
// Backticked repository paths, the shape a documentation check extracts.
const check = (over: Partial<IReferencesResolveOptions> = {}) =>
  referencesResolve({ ...ID, files: 'docs/**/*.md', extract: /`([\w./-]+\.\w+)`/, ...over });

describe('referencesResolve — the refusing verdict', () => {
  it('fails on a reference to a file that does not exist, naming the document, the line and the reference', async () => {
    const verdict = await runCheck(check(), {
      tree: { 'docs/a.md': '# A\n\nSee `src/gone.ts` for details.\n', 'src/here.ts': '' },
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.findings).toEqual([
      {
        severity: 'error',
        file: 'docs/a.md',
        line: 3,
        message: 'docs/a.md references `src/gone.ts`, which does not resolve.',
        ruleId: 'doc-refs',
      },
    ]);
  });

  it('checks every reference, not only the first — a non-global extractor is made global', async () => {
    const verdict = await runCheck(check(), {
      tree: { 'docs/a.md': '`src/one.ts` and `src/two.ts`\n`src/here.ts`\n', 'src/here.ts': '' },
    });

    expect(errorsOf(verdict)).toEqual([
      'docs/a.md references `src/one.ts`, which does not resolve.',
      'docs/a.md references `src/two.ts`, which does not resolve.',
    ]);
  });

  it('works the same with an extractor that is already global, across several documents', async () => {
    const verdict = await runCheck(check({ extract: /`([\w./-]+\.\w+)`/g }), {
      tree: { 'docs/a.md': '`x/a.ts`', 'docs/b.md': '`x/b.ts`', 'docs/c.md': '`x/c.ts`' },
    });

    expect(verdict.findings.map((f) => f.file)).toEqual(['docs/a.md', 'docs/b.md', 'docs/c.md']);
  });

  it('asks a custom resolver instead of the file system, and hands it the context', async () => {
    const asked: string[] = [];
    const verdict = await runCheck(
      check({
        extract: /\[\[(\w+)\]\]/,
        resolve: (ref, ctx) => {
          asked.push(ref);
          return ctx.files.exists(`glossary/${ref}.md`);
        },
      }),
      { tree: { 'docs/a.md': '[[ratchet]] and [[zone]]', 'glossary/ratchet.md': '' } },
    );

    expect(asked).toEqual(['ratchet', 'zone']);
    expect(errorsOf(verdict)).toEqual(['docs/a.md references `zone`, which does not resolve.']);
  });
});

describe('referencesResolve — the passing verdict', () => {
  it('passes when every reference names a file that exists', async () => {
    const verdict = await runCheck(check(), { tree: { 'docs/a.md': '`src/here.ts`', 'src/here.ts': '' } });

    expect(verdict.ok).toBe(true);
  });

  it('only reads the documents `in` selects', async () => {
    const verdict = await runCheck(check(), {
      tree: { 'notes/a.md': '`src/gone.ts`', 'docs/b.md': 'nothing to resolve' },
    });

    expect(verdict.ok).toBe(true);
    expect(errorsOf(verdict)).toEqual([]);
  });

  it('holds at its ratchet, and a stored one overrides it', async () => {
    const tree = { 'docs/a.md': '`a/x.ts` `a/y.ts`' };

    expect((await runCheck(check({ ratchet: 2 }), { tree })).ok).toBe(true);
    expect((await runCheck(check({ ratchet: 2 }), { tree, threshold: 1 })).ok).toBe(false);
  });
});

describe('referencesResolve — an empty corpus', () => {
  /**
   * Two silences used to look identical here: no documents matched `in`, and documents
   * matched but the extractor found nothing in them. The first is now refused; the second
   * still passes, and the verdict says how many documents were read.
   */
  it('refuses an `in` that matched no document — the dead reference is right there, unread', async () => {
    const verdict = await runCheck(check({ files: 'guides/**/*.md' }), { tree: { 'docs/a.md': '`gone.ts`' } });

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)).toEqual([expect.stringContaining('`guides/**/*.md` matched nothing to read')]);
  });

  it('still passes a document in which the extractor matched nothing — the corpus was read, and had no reference', async () => {
    // The floor is about FILES read, not references found: a document with no link is a
    // legitimate document. What a changed link syntax costs is a separate question.
    const verdict = await runCheck(check(), { tree: { 'docs/a.md': 'links are now [[wiki]] style' } });

    expect(verdict.ok).toBe(true);
    expect(verdict.findings).toEqual([
      { severity: 'info', message: '✓ doc-refs — 1 file(s) examined, clean', ruleId: 'doc-refs' },
    ]);
  });
});
