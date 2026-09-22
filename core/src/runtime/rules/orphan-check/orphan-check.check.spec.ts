import { describe, expect, it } from 'vitest';

import type { ICheckContext, IRule } from '../../../domain';
import { orphanCheck } from './orphan-check.check';

const rule = (checkIds: string[]): IRule => ({ id: 'r', statement: 's', owner: 'AGENTS.md', enforcement: { checkIds } });
const ctx = {} as ICheckContext;

describe('orphanCheck', () => {
  it('fails (advisory) with a count and ids when checks enforce no rule, excluding itself', () => {
    const check = orphanCheck({ checkIds: () => ['a', 'b', 'orphan-check'], rules: () => [rule(['a'])] });
    expect(check.zone).toBe('product');
    expect(check.advisory).toBe(true);
    const verdict = check.run(ctx) as { ok: boolean; findings: readonly { message: string }[] };
    expect(verdict.ok).toBe(false);
    expect(verdict.findings[0].message).toContain('1 check(s)');
    expect(verdict.findings[0].message).toContain('b'); // the orphan
    expect(verdict.findings[0].message).not.toContain('orphan-check'); // itself excluded
  });

  it('passes when every check has a rule', () => {
    const check = orphanCheck({ checkIds: () => ['a'], rules: () => [rule(['a'])] });
    expect((check.run(ctx) as { ok: boolean }).ok).toBe(true);
  });
});
