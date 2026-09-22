import { describe, expect, it } from 'vitest';

import { invariantsInDocument, planInvariantSync } from './sync-invariants.model';

const req = (id: string, statement: string) => ({ id, statement });

describe('planInvariantSync', () => {
  it('proposes depositing a requirement with no invariant yet', () => {
    const plan = planInvariantSync([req('MEETING-3', 'a meeting freezes its fund once')], []);
    expect(plan.toDeposit).toEqual([{ id: 'MEETING-3', statement: 'a meeting freezes its fund once' }]);
    expect(plan.orphaned).toEqual([]);
  });

  it('flags an invariant whose requirement has vanished as an orphan', () => {
    const plan = planInvariantSync([], [{ id: 'BOT-7', location: 'be/src/modules/bot/BOT_MODULE.md' }]);
    expect(plan.orphaned).toEqual([{ id: 'BOT-7', location: 'be/src/modules/bot/BOT_MODULE.md' }]);
    expect(plan.toDeposit).toEqual([]);
  });

  it('reports ids present on both sides as in sync, never re-depositing', () => {
    const plan = planInvariantSync([req('GAP-1', 's')], [{ id: 'GAP-1', location: 'x.md' }]);
    expect(plan.inSync).toEqual(['GAP-1']);
    expect(plan.toDeposit).toEqual([]);
    expect(plan.orphaned).toEqual([]);
  });

  it('handles both directions at once', () => {
    const plan = planInvariantSync(
      [req('A-1', 'new'), req('A-2', 'kept')],
      [
        { id: 'A-2', location: 'm.md' },
        { id: 'A-9', location: 'm.md' },
      ],
    );
    expect(plan.toDeposit.map((d) => d.id)).toEqual(['A-1']);
    expect(plan.orphaned.map((o) => o.id)).toEqual(['A-9']);
    expect(plan.inSync).toEqual(['A-2']);
  });
});

describe('invariantsInDocument', () => {
  it('extracts distinct invariant ids by the supplied pattern', () => {
    const text = '| MEETING-3 | a rule | test: x |\n| MEETING-4 | another | none: reason |\n| MEETING-3 | dup | |';
    const found = invariantsInDocument('M.md', text, /\b([A-Z]+-\d+)\b/);
    expect(found).toEqual([
      { id: 'MEETING-3', location: 'M.md' },
      { id: 'MEETING-4', location: 'M.md' },
    ]);
  });
});
