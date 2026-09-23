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
 * for, the allowlist it reads, the two ratchets, and the menu half that must say so
 * when it could not read the menu at all.
 */
const BASE: IDocCountsOptions = {
  id: 'doc-counts',
  title: 'counts are derived, not restated',
  countableNouns: ['services', 'gates'],
  skipped: [/^docs\/_generated\//],
  allowlist: () => [],
  when: () => true,
};

const run = (tree: Record<string, string>, over: Partial<IDocCountsOptions> = {}): Promise<IVerdict> =>
  runCheck(docCounts({ ...BASE, ...over }), { tree });

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
  it('is a product-zone, read-only check that runs in the fast tier unless told otherwise', () => {
    const check = docCounts(BASE);

    expect(check).toMatchObject({ zone: 'product', capabilities: ['read'], tier: 'fast' });
    expect(docCounts({ ...BASE, tier: 'heavy' }).tier).toBe('heavy');
  });

  it('keeps the relevance predicate it was given', () => {
    const when = (changed: readonly string[]) => changed.includes('x');

    expect(docCounts({ ...BASE, when }).when).toBe(when);
  });
});

describe('docCounts — the inventory half', () => {
  it('fails on a restated count, naming the file, the line and the claim', async () => {
    const v = await run({ 'README.md': '# app\n\nThe platform runs 4 services.' });

    expect(v.ok).toBe(false);
    expect(errorsOf(v)).toEqual(['README.md:3  "4 services"  The platform runs 4 services.']);
  });

  it('reads every markdown file, the root one included', async () => {
    // `**/*.md` spans zero directories too; a corpus that dropped the root README would
    // miss the one document every visitor reads first.
    const v = await run({ 'README.md': '4 services', 'docs/deep/a.md': '9 gates' });

    expect(errorsOf(v).map((m) => m.split(':')[0])).toEqual(['README.md', 'docs/deep/a.md']);
  });

  it('holds the claims under the count ratchet, and fails on the next one', async () => {
    const tree = { 'a.md': '4 services', 'b.md': '9 gates' };

    expect((await run(tree, { countRatchet: 2 })).ok).toBe(true);
    expect((await run(tree, { countRatchet: 1 })).ok).toBe(false);
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

    expect(errorsOf(v).map((m) => m.split(':')[0])).toEqual(['docs/other.md']);
  });

  it('treats an allowlisted claim as a literal, not a pattern', async () => {
    // "1.5 gates" as a regex would also exempt "175 gates".
    const allowlist = () => [{ claim: '1.5 services', paths: ['a.md'] }];

    expect((await run({ 'a.md': 'we run 175 services' }, { allowlist })).ok).toBe(false);
  });

  it('does not scan the skipped trees', async () => {
    expect((await run({ 'docs/_generated/map.md': '4 services' })).ok).toBe(true);
  });

  it('passes a clean corpus and says how many documents it read', async () => {
    const v = await run({ 'a.md': 'how many services? `ls services/`', 'b.md': '# b' });

    expect(v.ok).toBe(true);
    expect(v.findings).toEqual([{ severity: 'info', message: '✓ 2 document(s), no restated counts' }]);
  });

  it('an empty corpus says "0 document(s)" — visible, rather than a blank pass', async () => {
    // Its corpus is every tracked markdown file, not a pathspec that can drift, so zero
    // means the repository has no documentation to restate anything in. The count in the
    // pass line is what keeps that state readable instead of looking like a clean run.
    const v = await run({ 'src/index.ts': '' });

    expect(v.findings[0].message).toBe('✓ 0 document(s), no restated counts');
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
    const v = await run(tree, { numberPattern: String.raw`\d{1,3}(?:\.\d{3})+|\d{1,4}` });
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
      skipped: [],
      claim: claimPattern(['services', 'gates']),
      dated: /\bStand\b/g,
    });

    expect(hits).toEqual([]);
  });

  it('skips every path a `/g` skip pattern names, not every other one', () => {
    const hits = scanCounts({
      files: ['gen/a.md', 'gen/b.md', 'gen/c.md'],
      read: () => '4 services',
      allowed: [],
      skipped: [/^gen\//g],
      claim: claimPattern(['services']),
    });

    expect(hits).toEqual([]);
  });
});

describe('docCounts — the menu half', () => {
  it('fails, rather than passing, when the menu cannot be read — it compared nothing', async () => {
    const v = await run({ 'a.md': '# nothing counted' }, { menu: MENU });

    expect(v.ok).toBe(false);
    expect(errorsOf(v)).toEqual(['ops/menu.sh cannot be read — the menu half of this check compared nothing.']);
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

  it('always fails a dead number — the menu has no such item', async () => {
    const v = await run(
      { 'ops/menu.sh': MENU_SCRIPT, 'RUNBOOK.md': 'Run option 7 to rotate.' },
      {
        menu: { ...MENU, ordinalRatchet: 10 },
      },
    );

    expect(v.ok).toBe(false);
    expect(errorsOf(v)).toEqual(['RUNBOOK.md:1  option 7  Run option 7 to rotate.']);
  });

  it('fails an unnamed number over the ordinal ratchet, naming the label it should carry', async () => {
    const v = await run({ 'ops/menu.sh': MENU_SCRIPT, 'RUNBOOK.md': 'Then run option 2.' }, { menu: MENU });

    expect(errorsOf(v)).toEqual(['RUNBOOK.md:1  option 2 = "Restore a backup"  ||  Then run option 2.']);
  });

  it('holds unnamed numbers under the ordinal ratchet', async () => {
    const tree = { 'ops/menu.sh': MENU_SCRIPT, 'RUNBOOK.md': 'Then run option 2.' };

    expect((await run(tree, { menu: { ...MENU, ordinalRatchet: 1 } })).ok).toBe(true);
  });

  it('fails a number with two dispatch arms — only the first can run', async () => {
    const script = `${MENU_SCRIPT}\n    2) restore_again ;;`;
    const v = await run({ 'ops/menu.sh': script, 'a.md': '# a' }, { menu: MENU });

    expect(errorsOf(v)).toEqual(['option 2 has 2 dispatch arms — only the first can run']);
  });

  it('works with menu patterns written WITHOUT `/g` — and terminates', () => {
    // An `exec` loop over a non-global regex never advances: the run hung on the first
    // line that referenced an item. `matchAll` on one throws. Both are normalised now.
    const labels = menuLabels(MENU_SCRIPT, /^\s*printf\s+'\s*(\d+)\)\s+([^\\']+)/m);
    const hits = scanOrdinals({
      files: ['RUNBOOK.md'],
      read: () => 'option 1 and option 9',
      labels,
      skipped: [],
      reference: /\boption\s+(\d+)\b/i,
    });

    expect([...labels.keys()]).toEqual(['1', '2']);
    expect(hits.map((h) => `${h.number}:${h.kind}`)).toEqual(['1:unnamed', '9:dead']);
  });

  it('skips the configured trees and unreadable files in the ordinal scan too', () => {
    const hits = scanOrdinals({
      files: ['docs/_generated/a.md', 'gone.md'],
      read: (f) => (f === 'gone.md' ? undefined : 'option 9'),
      labels: new Map(),
      skipped: [/^docs\/_generated\//],
      reference: MENU.reference,
    });

    expect(hits).toEqual([]);
  });

  it('does not demand a label made only of short words — there is nothing to match against', () => {
    const hits = scanOrdinals({
      files: ['a.md'],
      read: () => 'option 3',
      labels: new Map([['3', 'Go on']]),
      skipped: [],
      reference: MENU.reference,
    });

    expect(hits).toEqual([]);
  });
});
