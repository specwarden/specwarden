import { describe, expect, it } from 'vitest';

import { type IVerdict, errorsOf, runCheck } from 'specwarden';
import {
  type IDocCountsOptions,
  claimPattern,
  docCounts,
  menuLabels,
  scanCounts,
  scanOrdinals,
} from './doc-counts.check';

/**
 * The check as a run sees it — the scanners are covered beside them in
 * `doc-counts.check.spec.ts`; this is what the factory adds on top: the corpus it asks
 * for, the allowlist it reads, the one ratchet, and the menu half that must say so when it
 * could not read the menu at all.
 */
const BASE: IDocCountsOptions = {
  countableNouns: ['services', 'gates'],
  except: ['docs/_generated'],
  allowlist: () => [],
  when: () => true,
};

const run = (
  tree: Record<string, string>,
  over: Partial<IDocCountsOptions> = {},
  threshold?: number,
): Promise<IVerdict> => runCheck(docCounts({ ...BASE, ...over }), { tree, threshold });

/** What a restated count says, at a line. */
const restated = (at: string, claim: string): string =>
  `${at} restates "${claim}" — a count the repository owns goes stale in prose. Say how to count it, date it, or hedge it.`;

/** A menu script whose items and dispatch arms are the source of truth. */
const MENU_SCRIPT = [
  "printf '  1) Back up the database\\n'",
  "printf '  2) Restore a backup (into a throwaway container)\\n'",
  'case "$choice" in',
  '    1) backup ;;',
  '    2) restore ;;',
  'esac',
].join('\n');

const MENU = {
  source: 'ops/menu.sh',
  item: /^\s*printf\s+'\s*(\d+)\)\s+([^\\']+)/gm,
  reference: /\boption\s+(\d+)\b/gi,
  dispatch: /^\s{4}(\d+)\)/gm,
};

describe('docCounts — the identity a run reads', () => {
  it('is a product-zone, read-only check named `doc-counts`, in the fast tier unless told otherwise', () => {
    const check = docCounts(BASE);

    expect(check).toMatchObject({ id: 'doc-counts', zone: 'product', capabilities: ['read'], tier: 'fast' });
    expect(docCounts({ ...BASE, tier: 'heavy' }).tier).toBe('heavy');
  });

  it('keeps the relevance predicate it was given', () => {
    const when = (changed: readonly string[]) => changed.includes('x');

    expect(docCounts({ ...BASE, when }).when).toBe(when);
  });
});

describe('docCounts — the inventory half', () => {
  // It named the place only inside its message: a finding with no `file` or `line` is one no
  // reporter can annotate, and no reader can jump to.
  it('fails on a restated count, carrying the file and the line, and says what to do', async () => {
    const v = await run({ 'README.md': '# app\n\nThe platform runs 4 services.' });

    expect(v.ok).toBe(false);
    expect(errorsOf(v)).toEqual([restated('README.md:3', '4 services')]);
    expect(v.findings[0]).toMatchObject({ file: 'README.md', line: 3 });
  });

  it('reads every markdown file, the root one included', async () => {
    // `**/*.md` spans zero directories too; a corpus that dropped the root README would
    // miss the one document every visitor reads first.
    const v = await run({ 'README.md': '4 services', 'docs/deep/a.md': '9 gates' });

    expect(v.findings.map((f) => f.file)).toEqual(['README.md', 'docs/deep/a.md']);
  });

  it('holds the claims under the ratchet, lists them as tolerated, and fails on the next one', async () => {
    const tree = { 'a.md': '4 services', 'b.md': '9 gates' };
    const held = await run(tree, { ratchet: 2 });

    expect(held.ok).toBe(true);
    expect(held.measured).toBe(2);
    expect(held.findings[0].message).toContain('2 pre-existing violation(s) tolerated under ratchet 2');
    expect((await run(tree, { ratchet: 1 })).ok).toBe(false);
  });

  // `countRatchet` was the check's own, so the threshold `--tighten` stored never reached it.
  it('holds to the STORED threshold the run hands it, over the declared ceiling', async () => {
    const tree = { 'a.md': '4 services', 'b.md': '9 gates' };

    expect((await run(tree, {}, 2)).ok).toBe(true);
    expect((await run(tree, { ratchet: 5 }, 1)).ok).toBe(false);
  });

  it('exempts a declared threshold only in the document the allowlist names, read through the file port', async () => {
    // The allowlist is a function of `read` so a repository can keep its thresholds in a
    // file of its own; the check must hand it the same port it reads documents through.
    const allowlist = (read: (path: string) => string | undefined) =>
      JSON.parse(read('thresholds.json') ?? '[]') as { claim: string; paths: string[] }[];
    const tree = {
      'thresholds.json': JSON.stringify([{ claim: '9 gates', paths: ['docs/policy.md'] }]),
      'docs/policy.md': 'A tier holds 9 gates.',
      'docs/other.md': 'A tier holds 9 gates.',
    };
    const v = await run(tree, { allowlist });

    expect(v.findings.map((f) => f.file)).toEqual(['docs/other.md']);
  });

  it('treats an allowlisted claim as a literal, not a pattern', async () => {
    // "1.5 gates" as a regex would also exempt "175 gates".
    const allowlist = () => [{ claim: '1.5 services', paths: ['a.md'] }];

    expect((await run({ 'a.md': 'we run 175 services' }, { allowlist })).ok).toBe(false);
  });

  it('does not read what `except` leaves out', async () => {
    expect((await run({ 'docs/_generated/map.md': '4 services', 'README.md': '# a' })).ok).toBe(true);
  });

  it('an `except` that swallowed every document is a failure, not a clean corpus', async () => {
    const v = await run({ 'docs/_generated/map.md': '4 services' });

    expect(v.ok).toBe(false);
    expect(errorsOf(v)[0]).toContain('`**/*.md` matched 1 file(s), and `except` exempted all of them');
  });

  it('passes a clean corpus with the engine’s pass line, naming how many documents it read', async () => {
    const v = await run({ 'a.md': 'how many services? `ls services/`', 'b.md': '# b' });

    expect(v.ok).toBe(true);
    expect(v.findings).toEqual([
      { severity: 'info', message: '✓ doc-counts — 2 document(s) examined, clean', ruleId: 'doc-counts' },
    ]);
  });

  it('an empty corpus is a failure naming the pathspec, unless the floor says an empty one is expected', async () => {
    // It passed as "✓ 0 document(s)": a count check over no documents finds no restated
    // count, forever, and the green line looked like every other clean run.
    const v = await run({ 'src/index.ts': '' });

    expect(v.ok).toBe(false);
    expect(errorsOf(v)[0]).toContain('examined 0 document(s) — `**/*.md` matched nothing to read');
    expect((await run({ 'src/index.ts': '' }, { corpus: { atLeast: 0 } })).ok).toBe(true);
  });

  it('reads the corpus it is pointed at, not every markdown file', async () => {
    const tree = { 'docs/a.md': 'There are 4 services.', 'README.md': 'There are 9 services.' };

    expect(errorsOf(await run(tree, { docs: 'docs/**/*.md' }))).toEqual([restated('docs/a.md:1', '4 services')]);
  });
});

describe('docCounts — the grammar is an option, because the defaults are English', () => {
  it('takes another language’s hedge', async () => {
    const tree = { 'a.md': 'etwa 4 services' };

    expect((await run(tree)).ok).toBe(false);
    expect((await run(tree, { hedge: String.raw`(?:etwa|rund)\s+` })).ok).toBe(true);
  });

  it('takes another language’s ordinal lead-in', async () => {
    const tree = { 'a.md': 'Schritt 4 services the queue.' };

    expect((await run(tree)).ok).toBe(false);
    expect((await run(tree, { ordinalLead: String.raw`(?:Schritt)\s*` })).ok).toBe(true);
  });

  it('takes another locale’s digit grouping', async () => {
    const tree = { 'a.md': 'we host 1.200 services' };

    // Under the default grammar "1.200" is not a number at all, so the claim is MISSED —
    // the silent outcome, green over a restated count. The override is what finds it.
    expect((await run(tree)).ok).toBe(true);
    const v = await run(tree, { number: String.raw`\d{1,3}(?:\.\d{3})+|\d{1,4}` });
    expect(errorsOf(v)[0]).toContain('"1.200 services"');
  });

  it('takes another language’s date marker', async () => {
    const tree = { 'a.md': 'Stand Mai: 4 services.' };

    expect((await run(tree)).ok).toBe(false);
    expect((await run(tree, { dated: /\bStand\b/ })).ok).toBe(true);
  });

  it('reads a `/g` date marker the same way on every line', () => {
    // A global regex keeps `lastIndex` between `.test` calls: the second dated line of a
    // document read as UNDATED, and its honest measurement was reported as a defect.
    const hits = scanCounts({
      files: ['a.md'],
      read: () => 'Stand Mai: 4 services.\nStand Mai: 9 gates.\nStand Mai: 7 services.',
      allowed: [],
      claim: claimPattern(['services', 'gates']),
      dated: /\bStand\b/g,
    });

    expect(hits).toEqual([]);
  });
});

describe('docCounts — the menu half', () => {
  it('fails, rather than passing, when the menu cannot be read — it compared nothing', async () => {
    const v = await run({ 'a.md': '# nothing counted' }, { menu: MENU });

    expect(v.ok).toBe(false);
    expect(errorsOf(v)).toEqual([
      'ops/menu.sh cannot be read, so the menu half of this check compared nothing. Point `menu.source` at the file whose items are the menu.',
    ]);
    expect(v.findings[0]).toMatchObject({ file: 'ops/menu.sh' });
  });

  it('accepts a number that travels with its label', async () => {
    const v = await run(
      { 'ops/menu.sh': MENU_SCRIPT, 'RUNBOOK.md': 'Run option 1 (Back up the database) first.' },
      {
        menu: MENU,
      },
    );

    expect(v.ok).toBe(true);
  });

  it('always fails a dead number — the menu has no such item — whatever the ratchet', async () => {
    const v = await run(
      { 'ops/menu.sh': MENU_SCRIPT, 'RUNBOOK.md': 'Run option 7 to rotate.' },
      {
        menu: MENU,
        ratchet: 10,
      },
    );

    expect(v.ok).toBe(false);
    expect(errorsOf(v)).toEqual([
      'RUNBOOK.md:1 names option 7, which the menu in ops/menu.sh does not have. Point it at the item it meant, by number and label.',
    ]);
    expect(v.findings[0]).toMatchObject({ file: 'RUNBOOK.md', line: 1 });
  });

  it('fails an unnamed number over the ratchet, naming the label it should carry', async () => {
    const v = await run({ 'ops/menu.sh': MENU_SCRIPT, 'RUNBOOK.md': 'Then run option 2.' }, { menu: MENU });

    expect(errorsOf(v)).toEqual([
      'RUNBOOK.md:1 names option 2 without its label, "Restore a backup" — a renumbered menu would point it elsewhere. Write the label beside the number.',
    ]);
  });

  // `menu.ordinalRatchet` was a second bar beside `countRatchet`. One ratchet counts both: each
  // is prose repeating what a file the repository owns already says.
  it('counts unnamed numbers and restated counts against the one ratchet', async () => {
    const tree = { 'ops/menu.sh': MENU_SCRIPT, 'RUNBOOK.md': 'Then run option 2.\n\nThere are 4 services.' };

    expect((await run(tree, { menu: MENU, ratchet: 2 })).measured).toBe(2);
    expect((await run(tree, { menu: MENU, ratchet: 2 })).ok).toBe(true);
    expect((await run(tree, { menu: MENU, ratchet: 1 })).ok).toBe(false);
  });

  // A key inside `menu` was never read: a bar written there, or a misspelled pattern, was
  // dropped in silence. The menu's keys are checked when the file loads, as the top level is.
  it('refuses a key the menu does not have, and a pattern it needs, by name', () => {
    expect(() => docCounts({ ...BASE, menu: { ...MENU, ordinalRatchet: 3 } as never })).toThrow(
      'docCounts `menu`: `ordinalRatchet` is not an option of docCounts `menu`',
    );
    expect(() => docCounts({ ...BASE, menu: { source: 'ops/menu.sh' } as never })).toThrow('`item` is required');
  });

  it('fails a number with two dispatch arms — only the first can run — at the arm that never runs', async () => {
    const script = `${MENU_SCRIPT}\n    2) restore_again ;;`;
    const v = await run({ 'ops/menu.sh': script, 'a.md': '# a' }, { menu: MENU });

    expect(errorsOf(v)).toEqual([
      'ops/menu.sh:7 is a second dispatch arm for option 2 (2 in all), and only the first can run. Renumber one of them.',
    ]);
    expect(v.findings[0]).toMatchObject({ file: 'ops/menu.sh', line: 7 });

    const thrice = await run({ 'ops/menu.sh': `${script}\n    2) and_again ;;`, 'a.md': '# a' }, { menu: MENU });
    expect(errorsOf(thrice)[0]).toContain('ops/menu.sh:7 is a second dispatch arm for option 2 (3 in all)');
  });

  it('works with menu patterns written WITHOUT `/g` — and terminates', () => {
    // An `exec` loop over a non-global regex never advances: the run hung on the first
    // line that referenced an item. `matchAll` on one throws. Both are normalised now.
    const labels = menuLabels(MENU_SCRIPT, /^\s*printf\s+'\s*(\d+)\)\s+([^\\']+)/m);
    const hits = scanOrdinals({
      files: ['RUNBOOK.md'],
      read: () => 'option 1 and option 9',
      labels,
      reference: /\boption\s+(\d+)\b/i,
    });

    expect([...labels.keys()]).toEqual(['1', '2']);
    expect(hits.map((h) => `${h.number}:${h.kind}`)).toEqual(['1:unnamed', '9:dead']);
  });

  it('skips a file it cannot read in the ordinal scan', () => {
    const hits = scanOrdinals({
      files: ['gone.md'],
      read: () => undefined,
      labels: new Map(),
      reference: MENU.reference,
    });

    expect(hits).toEqual([]);
  });

  it('does not demand a label made only of short words — there is nothing to match against', () => {
    const hits = scanOrdinals({
      files: ['a.md'],
      read: () => 'option 3',
      labels: new Map([['3', 'Go on']]),
      reference: MENU.reference,
    });

    expect(hits).toEqual([]);
  });
});
