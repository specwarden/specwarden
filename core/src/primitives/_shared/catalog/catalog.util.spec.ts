import { describe, expect, it } from 'vitest';

import { catalogNotes, resolveCatalog } from './catalog.util';

interface IEntry {
  readonly id: string;
  readonly value: string;
}

const BUILTIN: readonly IEntry[] = [
  { id: 'a', value: 'built-a' },
  { id: 'b', value: 'built-b' },
];

const ids = (entries: readonly IEntry[]) => entries.map((e) => e.id);

describe('resolveCatalog leaves the built-ins alone unless asked', () => {
  it('returns them unchanged and says nothing when there are no options', () => {
    const r = resolveCatalog(BUILTIN, undefined, 'pattern');
    expect(r.entries).toEqual(BUILTIN);
    expect(r.notes).toEqual([]);
  });

  it('treats an empty options object the same way', () => {
    expect(resolveCatalog(BUILTIN, {}, 'pattern').notes).toEqual([]);
  });
});

describe('extra adds beside the built-ins', () => {
  it('appends an entry with a new id', () => {
    const r = resolveCatalog(BUILTIN, { extra: [{ id: 'c', value: 'mine' }] }, 'pattern');
    expect(ids(r.entries)).toEqual(['a', 'b', 'c']);
    expect(r.notes).toEqual([]);
  });

  it('an entry reusing a built-in id REPLACES it, and says so', () => {
    const r = resolveCatalog(BUILTIN, { extra: [{ id: 'b', value: 'mine' }] }, 'pattern');
    expect(ids(r.entries)).toEqual(['a', 'b']);
    expect(r.entries.find((e) => e.id === 'b')?.value).toBe('mine');
    expect(r.notes).toEqual(["pattern 'b' overridden by a supplied entry of the same id."]);
  });
});

describe('disable is allowed, but never silent', () => {
  it('removes the entry and reports the reason', () => {
    const r = resolveCatalog(BUILTIN, { disable: [{ id: 'a', why: 'this repo has no AWS account' }] }, 'pattern');
    expect(ids(r.entries)).toEqual(['b']);
    expect(r.notes).toEqual(["pattern 'a' disabled: this repo has no AWS account"]);
  });

  it('reports an id that matches nothing rather than swallowing it', () => {
    // A renamed built-in would otherwise leave the caller believing a rule is off
    // while it keeps firing — the failure mode is a surprise red, or worse, a
    // surprise green somewhere else.
    const r = resolveCatalog(BUILTIN, { disable: [{ id: 'gone', why: 'obsolete' }] }, 'pattern');
    expect(ids(r.entries)).toEqual(['a', 'b']);
    expect(r.notes[0]).toContain("'gone' is disabled but no built-in has that id");
  });

  it('disabling everything leaves an empty catalog, loudly', () => {
    const r = resolveCatalog(
      BUILTIN,
      { disable: [{ id: 'a', why: 'x' }, { id: 'b', why: 'y' }] },
      'pattern',
    );
    expect(r.entries).toEqual([]);
    expect(r.notes).toHaveLength(2);
  });
});

describe('replace ignores the built-ins entirely', () => {
  it('uses only what was supplied, and reports the swap', () => {
    const r = resolveCatalog(BUILTIN, { replace: [{ id: 'z', value: 'only' }] }, 'pattern');
    expect(ids(r.entries)).toEqual(['z']);
    expect(r.notes[0]).toContain('REPLACED by 1 supplied entry');
  });

  it('replacing with an empty list disables the check, and does not do it quietly', () => {
    const r = resolveCatalog(BUILTIN, { replace: [] }, 'pattern');
    expect(r.entries).toEqual([]);
    expect(r.notes[0]).toContain('REPLACED by 0 supplied entries');
  });

  it('wins over extra and disable, since it is the whole list', () => {
    const r = resolveCatalog(
      BUILTIN,
      { replace: [{ id: 'z', value: 'only' }], extra: [{ id: 'c', value: 'ignored' }], disable: [{ id: 'a', why: 'ignored' }] },
      'pattern',
    );
    expect(ids(r.entries)).toEqual(['z']);
  });
});

describe('catalogNotes', () => {
  it('turns notes into info findings, so a verdict carries them', () => {
    expect(catalogNotes(['one', 'two'])).toEqual([
      { severity: 'info', message: 'one' },
      { severity: 'info', message: 'two' },
    ]);
  });

  it('is empty when nothing deviated', () => {
    expect(catalogNotes([])).toEqual([]);
  });
});
