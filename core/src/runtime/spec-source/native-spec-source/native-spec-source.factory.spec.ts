import { describe, expect, it } from 'vitest';

import { InMemoryFileSource } from '../../../infrastructure';
import { native } from './native-spec-source.factory';

/**
 * The native source: the consumer's own plans, a phase per task. `spec-source.spec.ts`
 * pins the headline read; this pins the edges that decide whether `plan status` is
 * telling the truth — which files count as plans, and the difference between "no plans
 * directory" and "a plans directory with nothing in it".
 */
const plan = (phases: string) => `**Status:** active\n\n${phases}`;

describe('native spec source', () => {
  it('names itself, so an ownership map can hand the role elsewhere', () => {
    expect(native({ plansDir: 'plans' }).name).toBe('native');
  });

  /**
   * "Not found" and "none" are different answers. Native plans carry tasks, not
   * standalone requirements; an empty list with `found: true` would claim the
   * requirements were read and there were none.
   */
  it('says it has no standalone requirements — found:false, with the reason — rather than an empty list', () => {
    const result = native({ plansDir: 'plans' }).requirements(new InMemoryFileSource({}));

    expect(result).toEqual({
      found: false,
      items: [],
      note: 'native plans carry tasks with acceptance, not standalone requirements',
    });
  });

  it('reads only markdown plans, skipping the directory README and anything else', () => {
    const files = new InMemoryFileSource({
      'plans/README.md': plan('## Phase 1 — from the readme\n**Acceptance.** nope\n'),
      'plans/notes.txt': plan('## Phase 1 — from a text file\n**Acceptance.** nope\n'),
      'plans/a.md': plan('## Phase 1 — real\n**Acceptance.** pnpm test\n'),
    });

    expect(native({ plansDir: 'plans' }).tasks(files).items).toEqual([
      { id: 'a.md#1', title: 'real', acceptance: 'pnpm test' },
    ]);
  });

  it('numbers tasks per plan, in the order the directory lists them', () => {
    const files = new InMemoryFileSource({
      'plans/b.md': plan('## Phase 1 — b1\n**Acceptance.** b\n'),
      'plans/a.md': plan('## Phase 1 — a1\n**Acceptance.** a\n\n## Phase 2 — a2\n**Acceptance.** a\n'),
    });

    expect(
      native({ plansDir: 'plans' })
        .tasks(files)
        .items.map((t) => t.id),
    ).toEqual(['a.md#1', 'a.md#2', 'b.md#1']);
  });

  it('is found — with no tasks — for a plans directory that exists but holds none', () => {
    const files = new InMemoryFileSource({ 'plans/README.md': '# plans\n' });

    expect(native({ plansDir: 'plans' }).tasks(files)).toEqual({ found: true, items: [] });
  });

  it('is not found when the plans path is a FILE, not a directory', () => {
    const files = new InMemoryFileSource({ plans: 'a file where a directory should be' });
    const result = native({ plansDir: 'plans' }).tasks(files);

    expect(result.found).toBe(false);
    expect(result.note).toBe('plans not found');
  });

  it('reads the plans directory it was given, never a default', () => {
    const files = new InMemoryFileSource({ 'docs/plans/a.md': plan('## Phase 1 — x\n**Acceptance.** y\n') });

    expect(native({ plansDir: 'plans' }).tasks(files).found).toBe(false);
    expect(native({ plansDir: 'docs/plans' }).tasks(files).items).toHaveLength(1);
  });
});
