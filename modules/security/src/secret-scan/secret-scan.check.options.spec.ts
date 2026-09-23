import { describe, expect, it } from 'vitest';

import { CheckOptionsError, errorsOf, runCheck } from 'specwarden';
import { secretScan } from './secret-scan.check';

const ID = { id: 'secret-scan', title: 't' };
/** Assembled, so this spec's own source never carries the shape it plants. */
const ACME = `acme_${'a'.repeat(32)}`;
const ACME_PATTERN = { id: 'acme-key', label: 'Acme API key', re: /\bacme_[a-z0-9]{32}\b/ };

/**
 * The GUIDE wrote `patterns.add` for `patterns.extra`. Nothing read `add`: the pattern was
 * never scanned for, the planted key of exactly that shape stayed green, and the run said
 * nothing about it.
 */
describe('secretScan — its options', () => {
  it('refuses an unknown key under `patterns` by name — the planted key was green', () => {
    const guide = { ...ID, patterns: { add: [ACME_PATTERN] } } as never;

    expect(() => secretScan(guide)).toThrow(CheckOptionsError);
    expect(() => secretScan(guide)).toThrow(
      "secretScan 'secret-scan': `patterns.add` is not an option — `patterns` takes extra, disable and replace.",
    );
  });

  it('finds the key with `patterns.extra`, the spelling that exists', async () => {
    const check = secretScan({ ...ID, patterns: { extra: [ACME_PATTERN] } });

    expect(errorsOf(await runCheck(check, { tree: { 'src/a.ts': `const k = '${ACME}';` } }))).toEqual([
      'src/a.ts:1 — Acme API key [acme-key]. If real, ROTATE it before deleting the line; if a placeholder, add it to the allowlist with a reason.',
    ]);
  });

  it('names no check when it was given no id', () => {
    expect(() => secretScan({ title: 't', patterns: { add: [] } } as never)).toThrow('secretScan: `patterns.add`');
  });

  it('refuses a `patterns` verb that is not a list', () => {
    expect(() => secretScan({ ...ID, patterns: { extra: ACME_PATTERN } } as never)).toThrow(
      '`patterns.extra` must be an array',
    );
  });

  it('takes an allowlist entry with a reason, and refuses one it cannot read', async () => {
    const allowed = secretScan({
      ...ID,
      patterns: { extra: [ACME_PATTERN] },
      allowlist: [{ file: 'docs/keys.md', patternId: '*', why: 'the document IS the pattern list' }],
    });

    expect(errorsOf(await runCheck(allowed, { tree: { 'docs/keys.md': ACME } }))).toEqual([]);
    expect(() => secretScan({ ...ID, allowlist: [{ path: 'docs/keys.md', patternId: '*' }] } as never)).toThrow(
      '`allowlist[0].path` is not an option — an entry takes file, patternId and why; `allowlist[0].file` must be a string',
    );
  });

  it('refuses a top-level option it does not have, and runs in the fast tier when none is said', () => {
    expect(() => secretScan({ ...ID, skip: ['dist/'] } as never)).toThrow('`skip` is not an option of secretScan');
    expect(secretScan(ID).tier).toBe('fast');
  });
});
