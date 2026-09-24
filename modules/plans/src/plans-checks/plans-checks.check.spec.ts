import { describe, expect, it } from 'vitest';

import { CheckOptionsError, errorsOf, runCheck } from 'specwarden';
import { plansChecks } from './plans-checks.check';

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

describe('plansChecks — the module in one call', () => {
  it('returns the three checks, each under its own id, in the fast tier, titled by the rule it enforces', () => {
    const checks = plansChecks();

    expect(checks.map((c) => c.id)).toEqual(['plan-staleness', 'plan-shape', 'decision-log-shape']);
    expect(new Set(checks.map((c) => c.tier))).toEqual(new Set(['fast']));
    // The preset wrote a title of its own for each, which said something slightly different
    // from the rule the check carried — two statements of one check.
    for (const check of checks) expect(check.title, check.id).toBe(check.rule?.statement);
  });

  it('is green over a live plan whose branch resolves, in the folders it defaults to', async () => {
    const roster = plansChecks().map((c) => ({ ...c }));
    for (const check of plansChecks()) {
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
    const [staleness, shape, decisions] = plansChecks({ plansDir: 'plans', archiveDir: 'plans-archive' });

    expect((await runCheck(staleness, { tree, branches: ['feat/refunds'] })).ok).toBe(true);
    expect((await runCheck(shape, { tree, roster: [] })).ok).toBe(false);
    expect(errorsOf(await runCheck(decisions, { tree }))[0]).toContain('plans/refunds.md:6 — decision');
  });

  // `tier` and `when` were accepted and dropped: every check was built in `fast`, whatever the
  // preset was told.
  it('applies `tier` and `when` to every check it builds, and a check’s own wins', () => {
    const when = { under: ['docs/'] };
    const checks = plansChecks({ tier: 'heavy', when, shape: { tier: 'nightly' } });

    expect(checks.map((c) => c.tier)).toEqual(['heavy', 'nightly', 'heavy']);
    for (const check of checks) {
      expect(check.when(['docs/a.md']), check.id).toBe(true);
      expect(check.when(['src/a.ts']), check.id).toBe(false);
    }
  });

  it('keeps `plan-staleness`’s own relevance — a markdown file changed — when the preset says none', () => {
    const [staleness, shape] = plansChecks();

    expect(staleness.when(['src/a.ts'])).toBe(false);
    expect(shape.when(['src/a.ts'])).toBe(true);
  });

  it('lays a check’s own options over the preset’s, and leaves one out only on `false`', () => {
    const checks = plansChecks({ shape: { id: 'plans', tier: 'heavy' }, decisionLog: false });

    expect(checks.map((c) => [c.id, c.tier])).toEqual([
      ['plan-staleness', 'fast'],
      ['plans', 'heavy'],
    ]);
    expect(plansChecks({ staleness: false, shape: false }).map((c) => c.id)).toEqual(['decision-log-shape']);
  });

  it('refuses the identity of ONE check — three cannot share an id, a title, a rule or a ratchet', () => {
    for (const option of ['id', 'title', 'rule', 'ratchet']) {
      expect(() => plansChecks({ [option]: 'x' } as never), option).toThrow(
        `\`${option}\` is not an option of plansChecks — a preset builds three checks, and ${option} belongs to one of them`,
      );
    }
  });

  it('refuses an option it does not have — the retired `decisions` among them — and hands a check’s refusal through', () => {
    expect(() => plansChecks({ plans: 'docs/_plans' } as never)).toThrow(CheckOptionsError);
    expect(() => plansChecks({ plans: 'docs/_plans' } as never)).toThrow('`plans` is not an option of plansChecks');
    expect(() => plansChecks({ decisions: false } as never)).toThrow('`decisions` is not an option of plansChecks');
    expect(() => plansChecks({ shape: { statuses: [] } as never })).toThrow('`statuses` is not an option of planShape');
  });
});
