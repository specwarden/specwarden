import { describe, expect, it } from 'vitest';

import { claimPattern, duplicateMenuNumbers, menuLabels, scanCounts, scanOrdinals } from './doc-counts.check';

/**
 * The whole value of this check is the line between four kinds of number, and three of the
 * four are EXEMPT. A classifier that quietly stops exempting turns a correct threshold into
 * a reported defect, and whoever meets that deletes the rule to make the gate green — the
 * opposite of the intent. None of it is visible by reading the pattern.
 *
 * So every case is one of the four classes, plus the false positives the first version of
 * the detector really produced: a range, a thousands separator, an ordinal, and a ratio.
 */
const NOUNS = ['files', 'gates', 'tables', 'assertions', 'agents', 'rules'];
const SKIPPED = [/^docs\/_codemap\//, /^docs\/_plans\//];

const claims = (
  text: string,
  options: { file?: string; allowed?: { match: RegExp; paths: string[] }[] } = {},
): string[] =>
  scanCounts({
    files: [options.file ?? 'skills/x/SKILL.md'],
    read: () => text,
    allowed: options.allowed ?? [],
    skipped: SKIPPED,
    claim: claimPattern(NOUNS),
  }).map((hit) => hit.claim);

describe('scanCounts — the four classes', () => {
  it('class 4: an inventory of repository state is reported', () => {
    expect(claims('The registry has 70 gates.')).toEqual(['70 gates']);
    expect(claims('from inside it: 508 files, 4300 assertions')).toEqual(['508 files', '4300 assertions']);
  });

  it('class 1: a threshold is exempt only in the documents the allowlist names', () => {
    const allowed = [{ match: /\b15 files\b/i, paths: ['server/testing/README.md'] }];

    expect(claims('Split a directory at 15 files.', { file: 'server/testing/README.md', allowed })).toEqual([]);
    expect(claims('Split a directory at 15 files.', { file: 'skills/x/SKILL.md', allowed })).toEqual(['15 files']);
  });

  it('class 2: a measurement is exempt by a date on its own line', () => {
    expect(claims('Measured 2026-07-30: the whole fast tier is 8 gates.')).toEqual([]);
    expect(claims('As of 2026-08-01 the suite is 463 files.')).toEqual([]);
  });

  it('class 2: a dated heading covers the rows under it, and stops at the next heading', () => {
    const doc = [
      '## Measured 2026-08-01',
      'the suite is 463 files',
      '',
      '## Conventions',
      'the registry has 70 gates',
    ].join('\n');

    expect(claims(doc)).toEqual(['70 gates']);
  });

  it('class 3: a hedged magnitude is exempt', () => {
    expect(claims('about 70 gates')).toEqual([]);
    expect(claims('~70 gates')).toEqual([]);
    expect(claims('at least 3 tables')).toEqual([]);
  });
});

describe('scanCounts — the false positives that shaped it', () => {
  it('treats a range as a hedge — the first detector reported both ends', () => {
    expect(claims('a spec of 1-3 files')).toEqual([]);
  });

  it('does not read an ordinal as a count', () => {
    expect(claims('Step 3 gates the release.')).toEqual([]);
    expect(claims('§5 rules the placement.')).toEqual([]);
  });

  it('does not read a ratio denominator as an inventory', () => {
    expect(claims('269 of 510 files resolve')).toEqual([]);
  });

  it('does not read a colon ratio as a count — "1:1 tables"', () => {
    expect(claims('a 1:1 tables relationship')).toEqual([]);
  });

  it('reads a thousands separator as one number, not two', () => {
    expect(claims('4 300 assertions')).toEqual(['4 300 assertions']);
  });

  it('does not report zero — an absence is not an inventory claim', () => {
    expect(claims('0 rules apply')).toEqual([]);
  });

  it('ignores fenced blocks and inline code', () => {
    expect(claims('```\n70 gates\n```')).toEqual([]);
    expect(claims('the constant `70 gates` is a literal')).toEqual([]);
  });

  it('does not scan the trees where a frozen number is correct by construction', () => {
    expect(claims('70 gates', { file: 'docs/_codemap/MAP.md' })).toEqual([]);
    expect(claims('70 gates', { file: 'docs/_plans/thing.md' })).toEqual([]);
  });

  it('carries the location a reader needs', () => {
    const hits = scanCounts({
      files: ['a.md'],
      read: () => 'intro\n\nThe registry has 70 gates.',
      allowed: [],
      skipped: SKIPPED,
      claim: claimPattern(NOUNS),
    });

    expect(hits[0]).toMatchObject({ file: 'a.md', line: 3, claim: '70 gates' });
  });
});

describe('the menu half', () => {
  const ITEM = /^\s*printf\s+'\s*(\d+)\)\s+([^\\']+)/gm;
  const REFERENCE = /\boption\s+\*{0,2}(\d+)\*{0,2}(?![\w])/gi;
  const DISPATCH = /^\s{4}(\d+)\)/gm;

  const MENU = ["  printf '  12) Export globals (pg_dumpall)\\n'", "  printf '  57) Cron status\\n'"].join('\n');

  const labels = menuLabels(MENU, ITEM);

  const ordinals = (text: string, file = 'maintenance/docs/RUNBOOK.md') =>
    scanOrdinals({ files: [file], read: () => text, labels, skipped: SKIPPED, reference: REFERENCE });

  it('takes the item NAME, not its parenthetical gloss', () => {
    expect(labels.get('12')).toBe('Export globals');
  });

  it('accepts a number that carries its name — the number is a keystroke, not a citation', () => {
    expect(ordinals('Run option 12 (Export globals) to dump roles.')).toEqual([]);
  });

  it('accepts a name on the neighbouring line, and no further', () => {
    expect(ordinals('Export globals\n| option 12 | dumps roles |')).toEqual([]);
    expect(ordinals('Export globals\n\n\n| option 12 | dumps roles |')).toHaveLength(1);
  });

  it('reports a bare number, with the label the writer should add', () => {
    const [hit] = ordinals('Run option 12 to dump roles.');

    expect(hit).toMatchObject({ kind: 'unnamed', number: '12', label: 'Export globals' });
  });

  /** The real defect the first run found, live, in the document that owns the numbering. */
  it('reports a number paired with ANOTHER item’s name', () => {
    const [hit] = ordinals('Use option 12 for cron status.');

    expect(hit).toMatchObject({ kind: 'unnamed', number: '12' });
  });

  it('reports a number the menu does not have at all as dead', () => {
    const [hit] = ordinals('Run option 99 to do the thing.');

    expect(hit).toMatchObject({ kind: 'dead', number: '99' });
  });

  /**
   * Two branches each added an item and each picked the next free number; the lines landed
   * in different sections, so the merge was clean and every other check kept passing. The
   * shell takes the FIRST arm, so one of the two became unreachable.
   */
  it('reports a number with two dispatch arms — only the first can run', () => {
    const dispatch = ['    87) do_one ;;', '    88) other ;;', '    87) do_two ;;'].join('\n');

    expect(duplicateMenuNumbers(dispatch, DISPATCH)).toEqual([
      'option 87 has 2 dispatch arms — only the first can run',
    ]);
  });

  it('says nothing when every arm is unique', () => {
    expect(duplicateMenuNumbers(['    87) a ;;', '    88) b ;;'].join('\n'), DISPATCH)).toEqual([]);
  });
});
