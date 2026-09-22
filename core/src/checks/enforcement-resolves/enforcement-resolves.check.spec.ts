import { describe, expect, it } from 'vitest';

import type { ICheckContext, IRule, IVerdict } from '../../domain';
import { enforcementResolves } from './enforcement-resolves.check';

const ID = { id: 'enforcement-resolves', title: 'enforcers resolve', tier: 'fast' as const };

const rule = (id: string, enforcement: IRule['enforcement']): IRule => ({
  id,
  statement: id,
  owner: 'AGENTS.md',
  enforcement,
});

function run(rules: IRule[], checkIds: string[], other?: string[]): IVerdict {
  const check = enforcementResolves({
    ...ID,
    rules: () => rules,
    checkIds: () => checkIds,
    otherEnforcerIds: other ? () => other : undefined,
  });
  return check.run({ changed: [] } as unknown as ICheckContext) as IVerdict;
}

describe('enforcementResolves', () => {
  it('is a product-zone check and asks for no capability', () => {
    const check = enforcementResolves({ ...ID, rules: () => [], checkIds: () => [] });
    expect(check.zone).toBe('product');
    expect(check.capabilities).toEqual([]);
  });

  it('passes when every named enforcer is a registered check', () => {
    expect(run([rule('a', { checkIds: ['lint-be', 'lint-fe'] })], ['lint-be', 'lint-fe']).ok).toBe(true);
  });

  // The defect it exists for: rule-coverage reports this rule as ENFORCED.
  it('fails on an id no registry holds, and names both the rule and the id', () => {
    const verdict = run([rule('no-db-push', { checkIds: ['db-push'] })], ['lint-be']);
    expect(verdict.ok).toBe(false);
    expect(verdict.findings[0].message).toContain("'no-db-push'");
    expect(verdict.findings[0].message).toContain("'db-push'");
  });

  it('accepts an enforcer declared by another registry — a perimeter rule id', () => {
    expect(run([rule('no-db-push', { checkIds: ['db-push'] })], ['lint-be'], ['db-push']).ok).toBe(true);
  });

  it('reports every unresolvable id, not the first', () => {
    const verdict = run(
      [rule('a', { checkIds: ['ghost-1', 'lint-be'] }), rule('b', { checkIds: ['ghost-2'] })],
      ['lint-be'],
    );
    expect(verdict.findings.filter((f) => f.severity === 'error')).toHaveLength(2);
  });

  it('ignores a rule declared not-mechanizable — it names no enforcer to resolve', () => {
    expect(run([rule('prose', { notMechanizable: 'authoring intent is not a pattern' })], []).ok).toBe(true);
  });

  // A rule with an EMPTY list is unenforced, which is rule-coverage's business, not
  // this check's. Two checks reporting the same defect teaches people to read neither.
  it('ignores an empty enforcer list — that is rule-coverage’s finding', () => {
    expect(run([rule('a', { checkIds: [] })], []).ok).toBe(true);
  });
});
