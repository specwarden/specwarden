import { describe, expect, it } from 'vitest';

import { openspec } from '@specwarden/openspec';
import { planInvariantSync, testContext } from 'specwarden';

/**
 * Everything this package publishes, wired the way a consumer wires it.
 *
 * The package exports a SOURCE rather than a check, so "run it clean and run it broken"
 * takes a different shape here: a source's two states are a tree that HAS the foreign
 * tool installed and a tree that does not. The second is the one that matters, and it is
 * the reason this port carries `found` at all — an adapter that answered "no
 * requirements" for a missing directory would let the reconciliation print `✓ in sync`
 * over a tree it never read.
 *
 * The last test closes the loop the consumer actually walks: source → `planInvariantSync`
 * → a deposit proposal. A source whose ids stopped being stable passes every test above
 * and breaks exactly there.
 */

const filesOf = (tree: Record<string, string>) => testContext({ tree }).files;

/** A repository with OpenSpec installed and a capability described. */
const INSTALLED: Record<string, string> = {
  'openspec/specs/billing/spec.md': [
    '# billing',
    '',
    '### Requirement: The system SHALL freeze an invoice once the period closes',
    '',
    'A frozen invoice is never edited again.',
    '',
    '### Requirement: The system SHALL refuse a second refund of one payment',
  ].join('\n'),
  'openspec/changes/add-invoice-freeze/tasks.md': [
    '# tasks',
    '',
    '- [x] write the migration',
    '- [ ] wire the gateway',
  ].join('\n'),
};

/** The same repository before OpenSpec was ever installed. */
const ABSENT: Record<string, string> = { 'README.md': '# a repository with no openspec tree\n' };

/** Installed, described nothing. The state an empty list would render invisible. */
const EMPTY: Record<string, string> = { 'openspec/specs/billing/spec.md': '# billing\n\nStill to be written.\n' };

describe('@specwarden/openspec', () => {
  it('reads requirements out of a capability, one id per heading', () => {
    const result = openspec().requirements(filesOf(INSTALLED));

    expect(result.found).toBe(true);
    expect(result.items).toHaveLength(2);
    // Prefixed by the capability, because OpenSpec identifies a requirement by its
    // wording and two capabilities may word one the same way.
    expect(result.items[0]?.id).toMatch(/^billing#/);
    expect(result.items[0]?.statement).toContain('freeze an invoice');
  });

  it('reads tasks, and which of them are done', () => {
    const result = openspec().tasks(filesOf(INSTALLED));

    expect(result.found).toBe(true);
    expect(result.items.map((t) => t.done)).toEqual([true, false]);
  });

  it('says it did NOT find the tree, rather than reporting nothing to do', () => {
    // The contract the port exists for. `found: false` is what stops the reconciliation
    // from printing agreement about a tree that was never there.
    const requirements = openspec().requirements(filesOf(ABSENT));
    const tasks = openspec().tasks(filesOf(ABSENT));

    expect(requirements.found).toBe(false);
    expect(requirements.note).toContain('openspec/specs');
    expect(tasks.found).toBe(false);
  });

  it('found but empty is reported WITH a note — this once printed "in sync" over nothing', () => {
    const result = openspec().requirements(filesOf(EMPTY));

    expect(result.found).toBe(true);
    expect(result.items).toEqual([]);
    expect(result.note).toBeDefined();
  });

  it('a fork that words its headings differently says so, instead of going silent', () => {
    const tree = { 'openspec/specs/billing/spec.md': '## Rule: an invoice is frozen once the period closes\n' };

    expect(openspec().requirements(filesOf(tree)).items).toEqual([]);
    expect(
      openspec({ requirementHeading: /^#{2,4}\s+Rule:\s*(.+?)\s*$/ }).requirements(filesOf(tree)).items,
    ).toHaveLength(1);
  });

  it('feeds the reconciliation a consumer runs: two requirements, no invariants, two deposits', () => {
    const result = openspec().requirements(filesOf(INSTALLED));

    const plan = planInvariantSync(result.items, []);

    expect(plan.toDeposit).toHaveLength(2);
    expect(plan.orphaned).toEqual([]);
  });
});
