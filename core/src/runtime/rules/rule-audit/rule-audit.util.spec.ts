import { describe, expect, it } from 'vitest';

import { type IRule, computeCoverage } from '../../../domain';
import { InMemoryFileSource } from '../../../infrastructure';
import { orphanChecks, ruleOwnerFindings } from './rule-audit.util';

const rule = (id: string, enforcement: IRule['enforcement']): IRule => ({
  id,
  statement: id,
  owner: 'AGENTS.md',
  enforcement,
});

describe('computeCoverage', () => {
  it('counts enforced, not-mechanizable, and unenforced-without-reason', () => {
    const cov = computeCoverage([
      rule('a', { checkIds: ['x'] }),
      rule('b', { notMechanizable: 'a real reason' }),
      rule('c', { checkIds: [] }), // declared enforced but names nothing → debt
    ]);
    expect(cov).toMatchObject({ total: 3, enforced: 1, notMechanizable: 1, unenforcedWithoutReason: 1 });
  });
});

describe('orphanChecks', () => {
  it('finds checks that no rule enforces (an enforcer with no rule is a defect)', () => {
    const rules = [rule('r', { checkIds: ['used'] })];
    expect(orphanChecks(['used', 'orphan'], rules)).toEqual(['orphan']);
  });
});

describe('ruleOwnerFindings', () => {
  it('flags a rule whose owner document is gone', () => {
    const files = new InMemoryFileSource({ 'AGENTS.md': '# router' });
    const rules = [
      rule('ok', { checkIds: ['x'] }), // owner AGENTS.md exists
      { id: 'gone', statement: 's', owner: 'docs/missing.md', enforcement: { checkIds: ['y'] } },
    ];
    const findings = ruleOwnerFindings(rules, files);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('docs/missing.md');
  });

  it('accepts an owner path with a section suffix', () => {
    const files = new InMemoryFileSource({ 'AGENTS.md': '# router' });
    const findings = ruleOwnerFindings(
      [{ id: 'r', statement: 's', owner: 'AGENTS.md § Releases', enforcement: { checkIds: ['x'] } }],
      files,
    );
    expect(findings).toEqual([]);
  });
});

describe('orphanChecks — what counts as enforcing', () => {
  it('counts only a rule that names checks; a not-mechanizable rule enforces nothing', () => {
    const rules = [rule('judged', { notMechanizable: 'a human reads it' })];

    expect(orphanChecks(['a'], rules)).toEqual(['a']);
  });

  it('is empty for an empty roster, and every check is an orphan with no rules', () => {
    expect(orphanChecks([], [rule('r', { checkIds: ['x'] })])).toEqual([]);
    expect(orphanChecks(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});

describe('ruleOwnerFindings — what counts as a document', () => {
  /**
   * An owner may be a PERSON or a team. Checking `@platform` for existence on disk
   * would fail every rule a person owns — a false positive a repository fixes by
   * deleting the owner, which is the one field that makes a rule arguable.
   */
  it('does not look for a file when the owner is not path-shaped', () => {
    const files = new InMemoryFileSource({});
    const findings = ruleOwnerFindings(
      [{ id: 'p', statement: 's', owner: '@platform', enforcement: { checkIds: ['x'] } }],
      files,
    );

    expect(findings).toEqual([]);
  });

  it('checks an owner that is path-shaped by a slash alone, and names it', () => {
    const findings = ruleOwnerFindings(
      [{ id: 'r', statement: 's', owner: 'skills/gates/SKILL', enforcement: { checkIds: ['x'] } }],
      new InMemoryFileSource({}),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'error', ruleId: 'rule-owner-resolves' });
    expect(findings[0].message).toBe(
      "rule 'r' names owner 'skills/gates/SKILL', whose document skills/gates/SKILL does not exist",
    );
  });

  it('attributes findings to the rule id it is given', () => {
    const findings = ruleOwnerFindings(
      [{ id: 'r', statement: 's', owner: 'gone.md', enforcement: { checkIds: ['x'] } }],
      new InMemoryFileSource({}),
      'owners',
    );

    expect(findings[0].ruleId).toBe('owners');
  });
});
