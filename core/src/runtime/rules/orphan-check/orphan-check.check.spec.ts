import { describe, expect, it } from 'vitest';

import type { ICheckContext, IRule } from '../../../domain';
import { orphanCheck } from './orphan-check.check';

const rule = (enforcedBy: string[]): IRule => ({
  id: 'r',
  statement: 's',
  owner: 'AGENTS.md',
  enforcement: { enforcedBy },
});
const ctx = {} as ICheckContext;

describe('orphanCheck', () => {
  it('fails (advisory) with a count and ids when checks enforce no rule, excluding itself', () => {
    const check = orphanCheck({ roster: () => ['a', 'b', 'orphan-check'], rules: () => [rule(['a'])] });
    expect(check.zone).toBe('product');
    expect(check.advisory).toBe(true);
    const verdict = check.run(ctx) as { ok: boolean; findings: readonly { message: string }[] };
    expect(verdict.ok).toBe(false);
    expect(verdict.findings[0].message).toContain('1 check(s)');
    expect(verdict.findings[0].message).toContain('b'); // the orphan
    expect(verdict.findings[0].message).not.toContain('orphan-check'); // itself excluded
  });

  it('passes when every check has a rule', () => {
    const check = orphanCheck({ roster: () => ['a'], rules: () => [rule(['a'])] });
    expect((check.run(ctx) as { ok: boolean }).ok).toBe(true);
  });
});

describe('orphanCheck — what it reports and how it is declared', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `c${i + 1}`);

  /**
   * The COUNT is the whole story and the ids are a sample: eleven orphans rendered one
   * per line would bury the run, and a list that stops at eight without saying so reads
   * as "these eight are all of them".
   */
  it('names at most eight orphans and marks the list as cut, while counting all of them', () => {
    const check = orphanCheck({ roster: () => ids(11), rules: () => [] });
    const verdict = check.run(ctx) as { findings: readonly { message: string; severity: string; ruleId?: string }[] };

    expect(verdict.findings).toHaveLength(1);
    expect(verdict.findings[0]).toMatchObject({ severity: 'error', ruleId: 'orphan-check' });
    expect(verdict.findings[0].message).toBe('11 check(s) enforce no declared rule: c1, c2, c3, c4, c5, c6, c7, c8, …');
  });

  it('does not mark a list of exactly eight as cut', () => {
    const verdict = orphanCheck({ roster: () => ids(8), rules: () => [] }).run(ctx) as {
      findings: readonly { message: string }[];
    };

    expect(verdict.findings[0].message.endsWith('c8')).toBe(true);
  });

  /**
   * Both thunks are read at RUN time. A snapshot taken while the roster was being built
   * misses the rules the harness contributes last, and reports the checks those rules
   * name as orphans.
   */
  it('reads the roster and the rules when it runs, not when it is built', () => {
    const roster = ['a'];
    const rules: IRule[] = [];
    const check = orphanCheck({ roster: () => roster, rules: () => rules });
    roster.push('b');
    rules.push(rule(['a', 'b']));

    expect((check.run(ctx) as { ok: boolean }).ok).toBe(true);
  });

  it('does not count a rule declared not-mechanizable as enforcing anything', () => {
    const notMechanizable: IRule = {
      id: 'n',
      statement: 's',
      owner: 'AGENTS.md',
      enforcement: { notMechanizable: 'judgement' },
    };
    const verdict = orphanCheck({ roster: () => ['a'], rules: () => [notMechanizable] }).run(ctx) as { ok: boolean };

    expect(verdict.ok).toBe(false);
  });

  it('excludes itself under the id it was given, and attributes the finding to that id', () => {
    const check = orphanCheck({ id: 'rules-audit', roster: () => ['rules-audit', 'x'], rules: () => [] });
    const verdict = check.run(ctx) as { findings: readonly { message: string; ruleId?: string }[] };

    expect(check.id).toBe('rules-audit');
    expect(verdict.findings[0].message).toBe('1 check(s) enforce no declared rule: x');
    expect(verdict.findings[0].ruleId).toBe('rules-audit');
  });

  it('is advisory by default, blocking when the repository says so, and runs in the tier it is given', () => {
    const base = { roster: () => [], rules: () => [] };

    expect(orphanCheck(base)).toMatchObject({ advisory: true, tier: 'fast', capabilities: [] });
    expect(orphanCheck({ ...base, advisory: false, tier: 'nightly' })).toMatchObject({
      advisory: false,
      tier: 'nightly',
    });
  });

  it('is relevant to every change — an orphan is a property of the roster, not of a diff', () => {
    const check = orphanCheck({ roster: () => [], rules: () => [] });

    expect(check.when([])).toBe(true);
    expect(check.when(['docs/a.md'])).toBe(true);
  });
});

describe('orphanCheck — the fix it points at', () => {
  it('names the smallest fix first: a `rule` on the check itself, not the register', () => {
    expect(orphanCheck({ roster: () => [], rules: () => [] }).hint).toBe(
      "Add `rule: '<the statement it enforces>'` to the check — or, for a rule several checks share, name it in the rule register.",
    );
  });
});
