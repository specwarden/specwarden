import { describe, expect, it } from 'vitest';

import { CheckOptionsError, errorsOf, runCheck } from 'specwarden';
import { docCounts } from './doc-counts.check';

const ID = { id: 'doc-counts', title: 't' };

/**
 * Two ways this factory used to meet a new repository. Without `skipped` and `allowlist`
 * it died on its first run with "options.allowlist is not a function"; with
 * `countableNouns: []` — the value the scaffolds wrote, commented "nothing to look for" —
 * it reported every number followed by a space.
 */
describe('docCounts — its options', () => {
  it('needs only its nouns: no skipped trees and no allowlist are the defaults a new repository has', async () => {
    const check = docCounts({ ...ID, countableNouns: ['services'] });

    expect(check.tier).toBe('fast');
    expect(check.when(['anything.txt'])).toBe(true);
    expect(errorsOf(await runCheck(check, { tree: { 'README.md': 'There are 4 services.' } }))).toEqual([
      'README.md:1  "4 services"  There are 4 services.',
    ]);
  });

  it('refuses an empty `countableNouns` when the file loads, naming the option', () => {
    expect(() => docCounts({ ...ID, countableNouns: [] })).toThrow(CheckOptionsError);
    expect(() => docCounts({ ...ID, countableNouns: [] })).toThrow(
      "docCounts 'doc-counts': `countableNouns` is empty — an empty list matches every number, not none.",
    );
  });

  it('refuses a noun that is the empty string, which widens the match the same way', () => {
    expect(() => docCounts({ ...ID, countableNouns: ['services', ''] })).toThrow('`countableNouns` is empty');
  });

  it('refuses an allowlist that is not a function, and a missing noun list, by name', () => {
    expect(() => docCounts({ ...ID, countableNouns: ['services'], allowlist: [] } as never)).toThrow(
      '`allowlist` must be a function',
    );
    expect(() => docCounts({ ...ID } as never)).toThrow('`countableNouns` is required');
  });
});
