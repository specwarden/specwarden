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
      [{ id: 'r', statement: 's', owner: 'AGENTS.md § Migration Rule', enforcement: { checkIds: ['x'] } }],
      files,
    );
    expect(findings).toEqual([]);
  });
});
