import { describe, expect, it } from 'vitest';

import type { ICheckContext, IRule, IVerdict } from '../../domain';
import { InMemoryFileSource } from '../../infrastructure';
import { ruleCoverage, ruleOwnerResolves } from './rule-coverage.check';

const ID = { id: 'rule-coverage', title: 'coverage', tier: 'fast' as const };
const rule = (id: string, enforcement: IRule['enforcement'], owner = 'AGENTS.md'): IRule => ({
  id,
  statement: id,
  owner,
  enforcement,
});

function runCoverage(rules: IRule[], ratchet?: number): IVerdict {
  const check = ruleCoverage({ ...ID, rules: () => rules, ratchet });
  return check.run({ changed: [] } as unknown as ICheckContext) as IVerdict;
}

describe('ruleCoverage', () => {
  it('is a product-zone check', () => {
    expect(ruleCoverage({ ...ID, rules: () => [] }).zone).toBe('product');
  });

  it('passes when every rule is enforced or has a reason', () => {
    expect(runCoverage([rule('a', { enforcedBy: ['x'] }), rule('b', { notMechanizable: 'a real reason' })]).ok).toBe(
      true,
    );
  });

  it('fails on an unenforced rule with no reason, and holds it under a ratchet', () => {
    const rules = [rule('a', { enforcedBy: [] })];
    expect(runCoverage(rules).ok).toBe(false);
    expect(runCoverage(rules, 1).ok).toBe(true);
  });
});

describe('ruleOwnerResolves', () => {
  it('flags a rule whose owner document is gone', () => {
    const files = new InMemoryFileSource({ 'AGENTS.md': '# r' });
    const check = ruleOwnerResolves({
      id: 'rule-owner-resolves',
      title: 'owner',
      tier: 'fast',
      rules: () => [rule('gone', { enforcedBy: ['x'] }, 'docs/missing.md')],
    });
    const v = check.run({ changed: [], files } as unknown as ICheckContext) as IVerdict;
    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('docs/missing.md');
  });

  it('passes when every owner resolves', () => {
    const files = new InMemoryFileSource({ 'AGENTS.md': '# r' });
    const check = ruleOwnerResolves({
      id: 'rule-owner-resolves',
      title: 'owner',
      tier: 'fast',
      rules: () => [rule('ok', { enforcedBy: ['x'] })],
    });
    expect((check.run({ changed: [], files } as unknown as ICheckContext) as IVerdict).ok).toBe(true);
  });
});
