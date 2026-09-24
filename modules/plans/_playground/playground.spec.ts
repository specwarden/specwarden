import { describe, expect, it } from 'vitest';

import { decisionLogShape, planShape, planStaleness, plansChecks } from '@specwarden/plans';
import {
  CHECK_CONTRACT_VERSION,
  CheckOptionsError,
  type ICheckMeta,
  defineConfig,
  errorsOf,
  loadConsumerTree,
  runCheck,
  testContext,
  uncoveredFactories,
} from 'specwarden';

import { BRANCHES, BROKEN, CLEAN, COVERED, KNOWN_CHECK_IDS, PLAN_SHAPE_CONVENTION, PROBE } from './repository';

/**
 * Everything this package publishes, wired the way a consumer wires it.
 *
 * A unit suite imports a unit by PATH and hands it a duck-typed context, so it keeps
 * passing over a package whose factory was renamed and never re-exported from the barrel.
 * This imports `@specwarden/plans` by NAME, through the package's own `exports` map, and
 * runs each check through the engine's own context.
 *
 * Every check runs TWICE over the same plans folder, clean and broken. A check returning
 * the same verdict for both cannot fail, and one that cannot fail reports success.
 */

describe('@specwarden/plans', () => {
  it('exercises every check factory the package publishes', async () => {
    const mod = (await import('@specwarden/plans')) as Record<string, unknown>;

    expect(uncoveredFactories(mod, { covered: COVERED, probe: PROBE })).toEqual([]);
  });

  it('plansChecks: the whole module in one call, green over the clean folder and red over the broken one', async () => {
    const checks = plansChecks({
      plansDir: 'docs/_plans',
      archiveDir: 'docs/_archive',
      shape: { name: PLAN_SHAPE_CONVENTION.name, knownCheckIds: KNOWN_CHECK_IDS },
    });

    expect(checks.map((c) => c.id)).toEqual(['plan-staleness', 'plan-shape', 'decision-log-shape']);
    for (const check of checks) {
      expect(errorsOf(await runCheck(check, { tree: CLEAN, branches: BRANCHES })), check.id).toEqual([]);
      expect((await runCheck(check, { tree: BROKEN, branches: BRANCHES })).ok, check.id).toBe(false);
    }
  });

  it('plansChecks: `tier` and `when` reach every check it builds', () => {
    const checks = plansChecks({ tier: 'heavy', when: { under: ['docs/_plans/'] } });

    expect(checks.map((c) => c.tier)).toEqual(['heavy', 'heavy', 'heavy']);
    expect(checks.map((c) => c.when(['src/a.ts']))).toEqual([false, false, false]);
  });

  it('an empty corpus fails every check: an absent plans folder, and a pathspec that matched nothing', async () => {
    // Three checks of one module gave three answers to "there is no folder": a green ✓,
    // "nothing to verify", and a failure.
    for (const check of plansChecks({ plansDir: 'planning', decisionLog: false })) {
      expect(errorsOf(await runCheck(check, { tree: CLEAN, branches: BRANCHES }))[0], check.id).toContain(
        'planning does not exist',
      );
    }
    const decisions = await runCheck(decisionLogShape({ docs: 'planning/*.md' }), { tree: CLEAN });
    expect(decisions.ok).toBe(false);
    expect(errorsOf(decisions)[0]).toContain('examined 0 document(s) — `planning/*.md` matched nothing to read');
  });

  it('planStaleness: an active plan names a branch that still resolves', async () => {
    const check = planStaleness({ plansDir: 'docs/_plans', archiveDir: 'docs/_archive' });

    expect((await runCheck(check, { tree: CLEAN, branches: BRANCHES })).ok).toBe(true);

    const verdict = await runCheck(check, { tree: BROKEN, branches: BRANCHES });
    const errors = errorsOf(verdict).join('\n');
    expect(verdict.ok).toBe(false);
    expect(errors).toContain('no longer exists');
    // And the archive entry that says nothing about what was harvested.
    expect(errors).toContain('archive header is missing');
  });

  it('planStaleness: a checkout with no branch refs SKIPS rather than archiving live work', async () => {
    // The honest "cannot tell". Guessed as spent, this check would file a plan whose
    // work is under way — which is worse than every defect it exists to find.
    const check = planStaleness({ plansDir: 'docs/_plans', archiveDir: 'docs/_archive' });

    const verdict = await runCheck(check, { tree: BROKEN, branches: null });

    expect(errorsOf(verdict).join('\n')).not.toContain('no longer exists');
    expect(verdict.findings.some((f) => f.message.includes('SKIPPED'))).toBe(true);
  });

  it('planShape: a plan names a real check, sizes nobody, and every phase says when it is done', async () => {
    const check = planShape({ ...PLAN_SHAPE_CONVENTION, knownCheckIds: KNOWN_CHECK_IDS });

    expect((await runCheck(check, { tree: CLEAN })).ok).toBe(true);

    const verdict = await runCheck(check, { tree: BROKEN });
    const errors = errorsOf(verdict).join('\n');
    expect(verdict.ok).toBe(false);
    expect(errors).toContain('--id no-such-gate');
    expect(errors).toContain('sizes work');
    expect(errors).toContain('no definition of done');
  });

  it('planShape: the known ids default to the RUN’s own roster, not to a hand-kept list', async () => {
    // A list kept by hand could forget a check, and the forgotten one would be invisible
    // to the audit meant to notice it. Reading the roster makes the list the engine's.
    const check = planShape(PLAN_SHAPE_CONVENTION);
    const roster: ICheckMeta[] = KNOWN_CHECK_IDS.map((id) => ({
      id,
      title: id,
      tier: 'fast',
      zone: 'consumer',
      capabilities: ['read'],
      contractVersion: CHECK_CONTRACT_VERSION,
    }));

    expect((await runCheck(check, { tree: CLEAN, roster })).ok).toBe(true);
    expect((await runCheck(check, { tree: CLEAN, roster: [] })).ok).toBe(false);
  });

  it('decisionLogShape: a rejected alternative states why it lost', async () => {
    const check = decisionLogShape();

    expect((await runCheck(check, { tree: CLEAN })).ok).toBe(true);

    const verdict = await runCheck(check, { tree: BROKEN });
    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict).join(' ')).toContain('one global bucket');
  });

  it('refuses a wrong option by name when the file loads, in every factory', () => {
    const refusals: [() => unknown, string][] = [
      [() => planStaleness({ mayCiteArchive: [] } as never), '`mayCiteArchive` is not an option of planStaleness'],
      [() => planShape({ nameRe: /x/ } as never), '`nameRe` is not an option of planShape'],
      [() => decisionLogShape({ docs: [] }), '`docs` is empty'],
      [() => plansChecks({ decisions: false } as never), '`decisions` is not an option of plansChecks'],
    ];

    for (const [build, message] of refusals) {
      expect(build, message).toThrow(CheckOptionsError);
      expect(build, message).toThrow(message);
    }
  });
});

// Wired with no `rule`, a module's check was an orphan the moment a register existed —
// and a preset's checks had nowhere to put one. The module knows what its check enforces.
describe('@specwarden/plans — the rule register, with the rules the checks imply', () => {
  it('every check carries an implied rule owned by the package, and a rule the consumer writes wins', () => {
    for (const check of plansChecks()) {
      expect(check.rule, check.id).toEqual(
        expect.objectContaining({ statement: expect.any(String), owner: '@specwarden/plans', implied: true }),
      );
      expect(check.title, check.id).toBe(check.rule?.statement);
    }
    expect(planShape({ rule: 'ours' }).rule).toEqual({ statement: 'ours' });
  });

  it('the register the engine assembles holds each implied rule, and drops one a register entry replaces', async () => {
    const config = defineConfig({
      autoload: false,
      checks: plansChecks(),
      rules: [
        {
          id: 'a-landed-plan-is-deleted',
          statement: 'a plan whose work has landed is deleted',
          owner: 'docs/PLANNING.md',
          enforcement: { enforcedBy: ['plan-staleness'] },
        },
      ],
    });
    const tree = await loadConsumerTree(testContext({ tree: {} }).files, '.specwarden', config);
    const byId = new Map(tree.rules.map((r) => [r.id, r]));

    expect(byId.get('a-landed-plan-is-deleted')?.owner).toBe('docs/PLANNING.md');
    expect(byId.has('plan-staleness')).toBe(false);
    for (const id of ['plan-shape', 'decision-log-shape']) {
      expect(byId.get(id), id).toMatchObject({ owner: '@specwarden/plans', enforcement: { enforcedBy: [id] } });
    }
  });
});
