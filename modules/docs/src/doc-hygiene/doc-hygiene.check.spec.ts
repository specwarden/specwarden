import { describe, expect, it } from 'vitest';

import { type IVerdict, errorsOf, runCheck } from 'specwarden';
import { docHygiene } from './doc-hygiene.check';

const ID = { id: 'doc-hygiene', title: 'hygiene', tier: 'fast' as const };

/** A row longer than the 40-character limit these cases run under. */
const FAT_ROW = `| ${'x'.repeat(60)} | y |`;

const run = (tree: Record<string, string>, opts: Partial<Parameters<typeof docHygiene>[0]> = {}): Promise<IVerdict> =>
  runCheck(docHygiene({ ...ID, docs: '**/*.md', fatCellLimit: 40, ...opts }), { tree });

describe('docHygiene — relative links', () => {
  it('is a product-zone check', () => {
    expect(docHygiene({ ...ID, docs: '**/*.md' }).zone).toBe('product');
  });

  it('flags a relative link to a file that does not exist, naming the document and the line', async () => {
    const v = await run({ 'docs/a.md': 'intro\nsee [x](./gone.md) here' });

    expect(v.ok).toBe(false);
    expect(errorsOf(v)).toEqual(['docs/a.md:2 links to `./gone.md`, which does not exist.']);
  });

  it('accepts a relative link that resolves', async () => {
    expect((await run({ 'docs/a.md': 'see [x](./b.md)', 'docs/b.md': '# b' })).ok).toBe(true);
  });

  it('resolves `../` against the document’s own directory, not the repository root', async () => {
    // Resolved from the root, `../README.md` would escape the repository and every
    // correct parent link in a nested document would be reported dead.
    const tree = { 'docs/guide/a.md': 'up: [readme](../README.md)', 'docs/README.md': '# docs' };

    expect((await run(tree)).ok).toBe(true);
    expect((await run({ 'docs/guide/a.md': 'up: [readme](../README.md)', 'README.md': '# root' })).ok).toBe(false);
  });

  it('resolves a link from a root document, and ignores the anchor', async () => {
    const tree = { 'README.md': 'see [the guide](./docs/guide.md#install)', 'docs/guide.md': '# guide' };

    expect((await run(tree)).ok).toBe(true);
  });

  it('does not read a link inside a code fence — an example is not a pointer', async () => {
    expect((await run({ 'a.md': '```\n[x](./gone.md)\n```\n' })).ok).toBe(true);
  });
});

describe('docHygiene — pointers into MOVED stubs', () => {
  it('flags a pointer into a MOVED section stub', async () => {
    const tree = {
      'A.md': 'per `B.md` §5 the rule holds',
      'B.md': '## 5. Beacon endpoints — MOVED to the gateway guide\n',
    };
    const v = await run(tree);

    expect(v.ok).toBe(false);
    expect(errorsOf(v).join('\n')).toContain('points at B.md §5, a MOVED stub');
  });

  it('reads a stub that names several sections at once — `5c / 5d.`', async () => {
    const target = '## 5c / 5d. Old endpoints — moved to the gateway doc\n';

    expect((await run({ 'A.md': 'per `B.md` §5d', 'B.md': target })).ok).toBe(false);
    expect((await run({ 'A.md': 'per `B.md` §5e', 'B.md': target })).ok).toBe(true);
  });

  it('finds the target by basename when the pointer carries a path', async () => {
    const tree = { 'A.md': 'per `docs/B.md` §2', 'docs/B.md': '## 2. Old — MOVED\n' };

    expect((await run(tree)).ok).toBe(false);
  });

  it('accepts a pointer into a live section', async () => {
    expect((await run({ 'A.md': 'per `B.md` §5', 'B.md': '## 5. Beacon endpoints\n' })).ok).toBe(true);
  });

  it('says nothing about a pointer to a document outside the corpus — it cannot see the headings', async () => {
    expect((await run({ 'A.md': 'per `ELSEWHERE.md` §5' })).ok).toBe(true);
  });
});

describe('docHygiene — the fat-cell ratchet', () => {
  it('ratchets fat table cells and fails on excess', async () => {
    const fat = { 'a.md': `${FAT_ROW}\n` };

    expect((await run(fat, { ratchet: 1 })).ok).toBe(true);
    expect((await run(fat, { ratchet: 0 })).ok).toBe(false);
  });

  it('says nothing about a count the ratchet tolerates — no error line under a green verdict', async () => {
    // An error-severity line printed beneath a pass reads as a failure to whoever scans
    // the log, and a gate that cries wolf stops being read.
    const v = await run({ 'a.md': `${FAT_ROW}\n` }, { ratchet: 1 });

    expect(errorsOf(v)).toEqual([]);
  });

  it('still fails a broken link when the fat-cell count is within its ratchet', async () => {
    // The ratchet is for the cells only; a dead link is never tolerated.
    const v = await run({ 'a.md': `${FAT_ROW}\n[x](./gone.md)\n` }, { ratchet: 5 });

    expect(v.ok).toBe(false);
  });

  it('names the worst files first, so the fix starts where it pays most', async () => {
    const v = await run({ 'a.md': `${FAT_ROW}\n`, 'b.md': `${FAT_ROW}\n${FAT_ROW}\n` });

    expect(errorsOf(v)).toEqual([
      '3 table rows over 40 chars; the ratchet is 0. Fix the longest tables (2 b.md, 1 a.md).',
    ]);
  });

  /**
   * The message is read in a CONSUMER's repository. It once ended by citing
   * `skills/agent-docs/SKILL.md §3` — a document no consumer has. A pointer the reader
   * follows and finds nothing at is the defect this very module exists to catch.
   */
  it('points the reader at nothing their repository does not have', async () => {
    const [message] = errorsOf(await run({ 'a.md': `${FAT_ROW}\n` }));

    expect(message).not.toContain('skills/agent-docs');
    expect(message).not.toMatch(/\bRule:/);
    // Every path it DOES name is one of the consumer's own documents.
    expect(message.match(/[\w./-]+\.md/g)).toEqual(['a.md']);
  });

  it('does not count a fat line inside a code fence', async () => {
    expect((await run({ 'a.md': '```\n' + `${FAT_ROW}\n` + '```\n' }, { ratchet: 0 })).ok).toBe(true);
  });

  it('skips a rendered source so its cells are not counted twice', async () => {
    const tree = { 'overlay.md': `${FAT_ROW}\n`, 'CLAUDE.md': '# rendered' };

    expect((await run(tree, { ratchet: 0, renderedSources: ['overlay.md'] })).ok).toBe(true);
  });

  it('defaults the limit to 300 characters', async () => {
    const check = docHygiene({ ...ID, docs: '**/*.md' });

    expect((await runCheck(check, { tree: { 'a.md': `| ${'x'.repeat(290)} |` } })).ok).toBe(true);
    expect((await runCheck(check, { tree: { 'a.md': `| ${'x'.repeat(310)} |` } })).ok).toBe(false);
  });
});

describe('docHygiene — what it examined', () => {
  it('fails, naming the pathspec, when the corpus is empty — zero documents is not a clean run', async () => {
    const v = await run({ 'src/index.ts': '' }, { docs: 'handbook/**/*.md' });

    expect(v.ok).toBe(false);
    expect(errorsOf(v)[0]).toContain('no document matched `handbook/**/*.md`');
  });

  it('fails when the rendered-source filter removed the whole corpus', async () => {
    const v = await run({ 'overlay.md': '# x' }, { renderedSources: ['overlay.md'] });

    expect(v.ok).toBe(false);
  });

  it('reads the corpus the pathspec selects, and nothing else', async () => {
    // A dead link OUTSIDE the configured corpus is somebody else's document.
    const tree = { 'docs/a.md': '# fine', 'vendor/b.md': '[x](./gone.md)' };

    expect((await run(tree, { docs: 'docs/**/*.md' })).ok).toBe(true);
  });

  it('skips a tracked document the file source cannot read, rather than crashing', async () => {
    const check = docHygiene({ ...ID, docs: '**/*.md' });
    const v = await runCheck(check, { tree: { 'a.md': '# a' }, tracked: ['a.md', 'deleted.md'] });

    expect(v.ok).toBe(true);
  });
});
