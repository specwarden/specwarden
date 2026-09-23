import { describe, expect, it } from 'vitest';

import { invariantsInDocument, planInvariantSync } from './sync-invariants.model';

const req = (id: string, statement: string) => ({ id, statement });

describe('planInvariantSync', () => {
  it('proposes depositing a requirement with no invariant yet', () => {
    const plan = planInvariantSync([req('BILLING-3', 'an invoice is issued once per order')], []);
    expect(plan.toDeposit).toEqual([{ id: 'BILLING-3', statement: 'an invoice is issued once per order' }]);
    expect(plan.orphaned).toEqual([]);
  });

  it('flags an invariant whose requirement has vanished as an orphan', () => {
    const plan = planInvariantSync([], [{ id: 'REQ-7', location: 'docs/modules/billing.md' }]);
    expect(plan.orphaned).toEqual([{ id: 'REQ-7', location: 'docs/modules/billing.md' }]);
    expect(plan.toDeposit).toEqual([]);
  });

  it('reports ids present on both sides as in sync, never re-depositing', () => {
    const plan = planInvariantSync([req('REQ-1', 's')], [{ id: 'REQ-1', location: 'x.md' }]);
    expect(plan.inSync).toEqual(['REQ-1']);
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
    const text = '| BILLING-3 | a rule | test: x |\n| BILLING-4 | another | none: reason |\n| BILLING-3 | dup | |';
    const found = invariantsInDocument('M.md', text, /\b([A-Z]+-\d+)\b/);
    expect(found).toEqual([
      { id: 'BILLING-3', location: 'M.md' },
      { id: 'BILLING-4', location: 'M.md' },
    ]);
  });

  /**
   * A pattern handed in already global must walk the whole document the same as one
   * that is not — and must not carry a position from one document into the next, which
   * would drop the first ids of every document after the first.
   */
  it('reads every id with a pattern that is already global, document after document', () => {
    const pattern = /\b([A-Z]+-\d+)\b/g;

    expect(invariantsInDocument('a.md', 'REQ-1 REQ-2', pattern).map((i) => i.id)).toEqual(['REQ-1', 'REQ-2']);
    expect(invariantsInDocument('b.md', 'REQ-3', pattern).map((i) => i.id)).toEqual(['REQ-3']);
  });

  it('skips a match whose id group captured nothing, rather than depositing an empty id', () => {
    const found = invariantsInDocument('a.md', 'id: REQ-1\nid: none\n', /id: ([A-Z]+-\d+)?/);

    expect(found).toEqual([{ id: 'REQ-1', location: 'a.md' }]);
  });
});
