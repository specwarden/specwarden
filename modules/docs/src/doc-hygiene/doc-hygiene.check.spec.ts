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
    expect(errorsOf(v)).toEqual([
      'docs/a.md:2 links to `./gone.md`, which does not exist. Point the link at where the file is now.',
    ]);
    expect(v.findings[0]).toMatchObject({ file: 'docs/a.md', line: 2 });
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

  // A span was read as a link: prose explaining the syntax failed on the path it quoted.
  it('does not read a link inside an inline code span, of one backtick or several', async () => {
    expect((await run({ 'a.md': 'Written as `[done](./gone.md)`, it is caught.\n' })).ok).toBe(true);
    expect((await run({ 'a.md': 'Or ``[x](./gone.md) with a ` inside``.\n' })).ok).toBe(true);
  });

  it('still reads the link beside a code span on the same line', async () => {
    const verdict = await run({ 'a.md': 'See `code` and [gone](./gone.md).\n' });
    expect(verdict.ok).toBe(false);
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

  it('lists the rows the ratchet tolerates under a line saying so, and states the count it measured', async () => {
    // An error line printed beneath a pass reads as a failure unless the verdict says it is
    // the tolerated set; and a count that is never reported is a count `--tighten` cannot read.
    const v = await run({ 'a.md': `${FAT_ROW}\n` }, { ratchet: 1 });

    expect(v.findings[0].message).toContain('1 pre-existing violation(s) tolerated under ratchet 1');
    expect(v.measured).toBe(1);
  });

  // It read `options.ratchet` alone, and never reported the rows it tolerated: `--tighten`
  // stored 0 off a passing run, and the next run failed over the debt it had been holding.
  it('holds to the STORED threshold the run hands it, over the declared ceiling', async () => {
    const fat = { 'a.md': `${FAT_ROW}\n${FAT_ROW}\n` };
    const check = docHygiene({ ...ID, fatCellLimit: 40 });

    expect((await runCheck(check, { tree: fat, threshold: 2 })).ok).toBe(true);
    const armed = docHygiene({ ...ID, fatCellLimit: 40, ratchet: 5 });
    expect((await runCheck(armed, { tree: fat, threshold: 1 })).ok).toBe(false);
  });

  it('still fails a broken link when the fat-cell count is within its ratchet', async () => {
    // The ratchet is for the cells only; a dead link is never tolerated.
    const v = await run({ 'a.md': `${FAT_ROW}\n[x](./gone.md)\n` }, { ratchet: 5 });

    expect(v.ok).toBe(false);
  });

  it('names every over-long row by file and line, with its length and what to do', async () => {
    const v = await run({ 'a.md': `${FAT_ROW}\n`, 'b.md': `# b\n${FAT_ROW}\n` });

    expect(errorsOf(v)).toEqual([
      'a.md:1 is a table row of 68 characters, over the 40 a row stays readable at. Move the prose out of the table.',
      'b.md:2 is a table row of 68 characters, over the 40 a row stays readable at. Move the prose out of the table.',
    ]);
    expect(v.findings.map((f) => [f.file, f.line])).toEqual([
      ['a.md', 1],
      ['b.md', 2],
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

    expect((await run(tree, { ratchet: 0, except: ['overlay.md'] })).ok).toBe(true);
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
    expect(errorsOf(v)[0]).toContain('examined 0 document(s) — `handbook/**/*.md` matched nothing to read');
  });

  it('fails when `except` removed the whole corpus, and accepts an empty one when told to', async () => {
    expect((await run({ 'overlay.md': '# x' }, { except: ['overlay.md'] })).ok).toBe(false);
    expect((await run({ 'overlay.md': '# x' }, { except: ['overlay.md'], corpus: { atLeast: 0 } })).ok).toBe(true);
  });

  it('prints the engine’s pass line, naming how many documents it read', async () => {
    expect((await run({ 'a.md': '# a' })).findings.map((f) => f.message)).toEqual([
      '✓ doc-hygiene — 1 document(s) examined, clean',
    ]);
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
