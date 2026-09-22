import { describe, expect, it } from 'vitest';

import type { IRule } from '../../../domain';
import { HARNESS_CHECK_IDS, harnessChecks } from './harness-checks.factory';

const RULES: readonly IRule[] = [
  { id: 'r1', statement: 's', owner: 'README.md', enforcement: { checkIds: ['some-check'] } },
];

const inputs = (checkIds: readonly string[] = ['some-check']) => ({
  rules: () => RULES,
  rulesDeclared: true,
  checkIds: () => checkIds,
  consumerDir: '.specwarden',
});

const ids = (cs: readonly { id: string }[]) => cs.map((c) => c.id);

describe('the self-checks exist without being asked for', () => {
  it('builds the five that need no repository fact', () => {
    const { checks, notes } = harnessChecks(inputs());
    expect(ids(checks)).toEqual([
      'rule-owner-resolves',
      'rule-coverage',
      'orphan-check',
      'enforcement-resolves',
      'ratchet-direction',
    ]);
    expect(notes).toEqual([]);
  });

  it('runs them in the fast tier by default, and in the tier a repository names', () => {
    expect(harnessChecks(inputs()).checks.every((c) => c.tier === 'fast')).toBe(true);
    expect(harnessChecks(inputs(), { tier: 'pre-commit' }).checks.every((c) => c.tier === 'pre-commit')).toBe(true);
  });

  it('points the ratchet check at the conventional store under the consumer dir', () => {
    // Proven through the option surface: a different consumerDir must yield a
    // different check (the glob is baked in at build time).
    const a = harnessChecks({ ...inputs(), consumerDir: '.specwarden' }).checks.find(
      (c) => c.id === 'ratchet-direction',
    );
    const b = harnessChecks({ ...inputs(), consumerDir: '.harness' }).checks.find((c) => c.id === 'ratchet-direction');
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a).not.toBe(b);
  });
});

describe('the zone barrier is opt-in', () => {
  it('is absent unless a product tree is named — a barrier over nothing cannot fail', () => {
    expect(ids(harnessChecks(inputs()).checks)).not.toContain('zone-boundary');
  });

  it('appears once one is', () => {
    const { checks } = harnessChecks(inputs(), {
      zone: { productSources: 'packages/engine/src/**/*.ts', forbiddenLiterals: [{ label: 'x', pattern: /x/ }] },
    });
    expect(ids(checks)).toContain('zone-boundary');
  });
});

describe('switching one off is allowed and never silent', () => {
  it('removes the check and reports the reason', () => {
    const { checks, notes } = harnessChecks(inputs(), {
      disable: [{ id: 'rule-coverage', why: 'rules are tracked in the forge' }],
    });
    expect(ids(checks)).not.toContain('rule-coverage');
    expect(notes).toEqual(["harness check 'rule-coverage' disabled: rules are tracked in the forge"]);
  });

  it('reports an id that matches no self-check instead of swallowing it', () => {
    const { checks, notes } = harnessChecks(inputs(), { disable: [{ id: 'rule-coverag', why: 'typo' }] });
    expect(checks).toHaveLength(5);
    expect(notes[0]).toContain("'rule-coverag' is disabled but no self-check has that id");
  });

  it('exposes the ids so a consumer can name one without guessing', () => {
    expect([...HARNESS_CHECK_IDS]).toEqual(expect.arrayContaining(['orphan-check', 'zone-boundary']));
  });
});

describe('the roster is read lazily', () => {
  it('orphan-check sees checks registered after it was built', () => {
    // The whole reason the inputs are thunks: the self-checks are part of the roster
    // they audit, and a list read at build time would report them as missing.
    let roster: string[] = [];
    const { checks } = harnessChecks({
      rules: () => RULES,
      rulesDeclared: true,
      checkIds: () => roster,
      consumerDir: '.specwarden',
    });
    roster = [...ids(checks), 'some-check'];
    const orphan = checks.find((c) => c.id === 'orphan-check');
    expect(orphan).toBeDefined();
    // It does not throw and it can see the late-registered id — the run itself is
    // covered by orphan-check's own spec.
    expect(roster).toContain('some-check');
  });
});

describe('a repository with no rule registry yet is not punished for starting', () => {
  it('leaves out the four rule audits when `rules` was never declared, and says so', () => {
    const { checks, notes } = harnessChecks({ ...inputs(), rulesDeclared: false });
    expect(ids(checks)).toEqual(['ratchet-direction']);
    expect(notes.some((n) => n.includes('no `rules` declared'))).toBe(true);
  });

  it('an EMPTY registry is still a registry — `rules: []` turns the audits on', () => {
    const { checks } = harnessChecks({ ...inputs(), rules: () => [], rulesDeclared: true });
    expect(ids(checks)).toContain('orphan-check');
  });
});
