import { describe, expect, it } from 'vitest';

import { CheckOptionsError, errorsOf, runCheck } from 'specwarden';
import { planChecks } from './plan-checks.check';

const PLAN = [
  '# Refunds',
  '',
  '**Status:** active',
  '**Branch:** feat/refunds',
  '',
  '### Decision: a refund is taken per line',
  '',
  '- Rejected: a free-text amount — a typed number reconciles against nothing.',
  '',
  '## Phase 1 — the refund line',
  '',
  '```bash',
  'pnpm gate --id plan-shape',
  '```',
].join('\n');

describe('planChecks — the module in one call', () => {
  it('returns the three checks, with their conventional ids, in the fast tier', () => {
    const checks = planChecks();

    expect(checks.map((c) => c.id)).toEqual(['plan-staleness', 'plan-shape', 'decision-log-shape']);
    expect(new Set(checks.map((c) => c.tier))).toEqual(new Set(['fast']));
  });

  it('is green over a live plan whose branch resolves, in the folders it defaults to', async () => {
    const roster = planChecks().map((c) => ({ ...c }));
    for (const check of planChecks()) {
      const verdict = await runCheck(check, {
        tree: { 'docs/_plans/refunds.md': PLAN },
        branches: ['feat/refunds'],
        roster,
      });
      expect(errorsOf(verdict), check.id).toEqual([]);
    }
  });

  it('points every check at the plans folder it is given, said once', async () => {
    const tree = { 'plans/refunds.md': PLAN.replace(' — a typed number reconciles against nothing.', '') };
    const [staleness, shape, decisions] = planChecks({ plansDir: 'plans', archiveDir: 'plans-archive' });

    expect((await runCheck(staleness, { tree, branches: ['feat/refunds'] })).ok).toBe(true);
    expect((await runCheck(shape, { tree, roster: [] })).ok).toBe(false);
    expect(errorsOf(await runCheck(decisions, { tree }))[0]).toContain('plans/refunds.md:6 — decision');
  });

  it('lays a check’s own options over the preset’s, and leaves one out only on `false`', () => {
    const checks = planChecks({ shape: { id: 'plans', tier: 'heavy' }, decisions: false });

    expect(checks.map((c) => [c.id, c.tier])).toEqual([
      ['plan-staleness', 'fast'],
      ['plans', 'heavy'],
    ]);
  });

  it('refuses an option it does not have, and hands a check’s refusal through', () => {
    expect(() => planChecks({ plans: 'docs/_plans' } as never)).toThrow(CheckOptionsError);
    expect(() => planChecks({ plans: 'docs/_plans' } as never)).toThrow('`plans` is not an option of planChecks');
    expect(() => planChecks({ shape: { statuses: [] } as never })).toThrow('`statuses` is not an option of planShape');
  });
});
