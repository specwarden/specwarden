import { describe, expect, it } from 'vitest';

import { changedContaining, changedEnding, changedUnder, resolveWhen } from './relevance.model';

/**
 * A relevance predicate is the quietest thing in a check: when it is wrong, the
 * symptom is a green run. So the cases that matter here are the ones where the
 * answer must be "yes, run it" — an empty declaration, an unknown shape — because
 * every wrong "no" is a check that reported success without looking.
 */
describe('relevance predicates', () => {
  it('under matches a path prefix and respects the trailing slash', () => {
    expect(changedUnder(['src/a.ts'], 'src/')).toBe(true);
    expect(changedUnder(['srcgen/a.ts'], 'src/')).toBe(false);
    expect(changedUnder(['a.ts'], 'src/')).toBe(false);
  });

  it('ending matches a suffix', () => {
    expect(changedEnding(['docs/a.md'], '.md')).toBe(true);
    expect(changedEnding(['docs/a.mdx'], '.md')).toBe(false);
  });

  it('containing matches anywhere in the path', () => {
    expect(changedContaining(['a/schema/b.ts'], '/schema/')).toBe(true);
    expect(changedContaining(['a/b.ts'], '/schema/')).toBe(false);
  });

  it('each takes several alternatives and needs only one to hit', () => {
    expect(changedUnder(['b/x'], 'a/', 'b/')).toBe(true);
    expect(changedEnding(['x.json'], '.md', '.json')).toBe(true);
    expect(changedContaining(['x/y'], 'q', 'y')).toBe(true);
  });

  it('none of them fires on an empty changed set', () => {
    expect(changedUnder([], 'src/')).toBe(false);
    expect(changedEnding([], '.md')).toBe(false);
    expect(changedContaining([], 'x')).toBe(false);
  });
});

describe('resolveWhen', () => {
  it('an absent declaration is always relevant', () => {
    expect(resolveWhen(undefined)(['anything'])).toBe(true);
    expect(resolveWhen(undefined)([])).toBe(true);
  });

  it('an EMPTY declaration is always relevant — the conservative answer', () => {
    // A spec that lost its only prefix must run, not silently stop running. The cost
    // of a needless run is time; the cost of a skipped one is a pass nobody earned.
    expect(resolveWhen({})(['anything'])).toBe(true);
    expect(resolveWhen({ under: [] })(['anything'])).toBe(true);
  });

  it('`always` says it out loud', () => {
    expect(resolveWhen({ always: true, under: ['nope/'] })(['other/a'])).toBe(true);
  });

  it('passes a predicate through unchanged', () => {
    const predicate = (changed: readonly string[]) => changed.includes('x');

    expect(resolveWhen(predicate)(['x'])).toBe(true);
    expect(resolveWhen(predicate)(['y'])).toBe(false);
  });

  it('ORs the three shapes together', () => {
    const when = resolveWhen({ under: ['src/'], ending: ['.md'], containing: ['/fixtures/'] });

    expect(when(['src/a.ts'])).toBe(true);
    expect(when(['README.md'])).toBe(true);
    expect(when(['a/fixtures/b.json'])).toBe(true);
    expect(when(['a/b.json'])).toBe(false);
  });
});
