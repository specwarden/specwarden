import { describe, expect, it } from 'vitest';

import { CheckOptionsError, errorsOf, runCheck } from 'specwarden';
import { docCounts } from './doc-counts.check';

const ID = { id: 'doc-counts' };

/**
 * Two ways this factory used to meet a new repository. Without its exemptions and
 * `allowlist` it died on its first run with "options.allowlist is not a function"; with
 * `countableNouns: []` — the value the scaffolds wrote, commented "nothing to look for" —
 * it reported every number followed by a space.
 */
describe('docCounts — its options', () => {
  it('needs only its nouns: no exemptions and no allowlist are the defaults a new repository has', async () => {
    const check = docCounts({ countableNouns: ['services'] });

    expect(check).toMatchObject({ id: 'doc-counts', tier: 'fast' });
    expect(check.when(['anything.txt'])).toBe(true);
    expect(errorsOf(await runCheck(check, { tree: { 'README.md': 'There are 4 services.' } }))).toEqual([
      'README.md:1 restates "4 services" — a count the repository owns goes stale in prose. Say how to count it, date it, or hedge it.',
    ]);
  });

  it('refuses an empty `countableNouns` when the file loads, naming the option', () => {
    expect(() => docCounts({ ...ID, countableNouns: [] })).toThrow(CheckOptionsError);
    expect(() => docCounts({ ...ID, countableNouns: [] })).toThrow("docCounts 'doc-counts': `countableNouns` is empty");
  });

  it('refuses a noun that is the empty string, which widens the match to every number', () => {
    expect(() => docCounts({ ...ID, countableNouns: ['services', ''] })).toThrow(
      "docCounts 'doc-counts': `countableNouns` holds an empty string, which matches every number, not none.",
    );
    expect(() => docCounts({ countableNouns: [''] })).toThrow('docCounts: `countableNouns` holds');
  });

  it('refuses an allowlist that is not a function, and a missing noun list, by name', () => {
    expect(() => docCounts({ ...ID, countableNouns: ['services'], allowlist: [] } as never)).toThrow(
      '`allowlist` must be a function',
    );
    expect(() => docCounts({ ...ID } as never)).toThrow('`countableNouns` is required');
  });

  it('refuses the retired spellings by name: one `ratchet`, `except`, `number`', () => {
    for (const retired of ['countRatchet', 'skipped', 'numberPattern']) {
      expect(() => docCounts({ ...ID, countableNouns: ['services'], [retired]: 1 } as never)).toThrow(
        `\`${retired}\` is not an option of docCounts`,
      );
    }
  });
});
