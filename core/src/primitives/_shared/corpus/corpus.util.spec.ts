import { describe, expect, it } from 'vitest';

import { InMemoryFileSource } from '../../../infrastructure';
import { readAll, readTracked } from './corpus.util';

const tree = { 'docs/a.md': 'A', 'docs/b.md': 'B', 'src/c.ts': 'C' };

describe('readAll', () => {
  it('returns every match with its contents, in the source’s sorted order', () => {
    const docs = readAll(new InMemoryFileSource(tree), 'docs/*.md');

    expect(docs).toEqual([
      { file: 'docs/a.md', text: 'A' },
      { file: 'docs/b.md', text: 'B' },
    ]);
  });

  it('returns nothing when the pattern matches nothing — the caller decides if that is a defect', () => {
    // Deliberately not an error here: `defineCheck`’s `corpus` floor is where a caller
    // says how many it expected, because only the caller knows.
    expect(readAll(new InMemoryFileSource(tree), 'nope/*.md')).toEqual([]);
  });

  it('drops an entry it cannot read rather than carrying a hole', () => {
    const files = new InMemoryFileSource(tree);
    // A path that vanished between the listing and the read is a race, not a finding.
    const vanishing = {
      glob: (p: string) => files.glob(p),
      tryRead: (p: string) => (p === 'docs/a.md' ? undefined : files.tryRead(p)),
    } as never;

    expect(readAll(vanishing, 'docs/*.md').map((d) => d.file)).toEqual(['docs/b.md']);
  });
});

describe('readTracked', () => {
  const vcs = (files: readonly string[]) => ({ trackedFiles: () => files }) as never;

  it('reads what version control reports, not what the disk happens to hold', () => {
    // The distinction that matters: a glob sees build output and scratch files; the
    // tracked set is what the repository actually contains.
    const docs = readTracked(vcs(['docs/a.md']), new InMemoryFileSource(tree));

    expect(docs).toEqual([{ file: 'docs/a.md', text: 'A' }]);
  });

  it('skips a tracked path with no readable contents', () => {
    const docs = readTracked(vcs(['docs/a.md', 'docs/deleted.md']), new InMemoryFileSource(tree));

    expect(docs.map((d) => d.file)).toEqual(['docs/a.md']);
  });
});
