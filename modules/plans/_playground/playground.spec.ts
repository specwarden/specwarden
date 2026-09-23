import { describe, expect, it } from 'vitest';

import { decisionLogShape, planChecks, planShape, planStaleness } from '@specwarden/plans';
import { CHECK_CONTRACT_VERSION, CheckOptionsError, type ICheckMeta, errorsOf, runCheck } from 'specwarden';

import { BRANCHES, BROKEN, CLEAN, COVERED, KNOWN_GATE_IDS, PLAN_SHAPE_CONVENTION } from './repository';

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

const ID = { title: 'playground', tier: 'fast' as const };

const isCheck = (value: unknown): boolean =>
  typeof (value as { id?: unknown } | null)?.id === 'string' &&
  typeof (value as { run?: unknown } | null)?.run === 'function';

/**
 * Every export that builds checks, told from a helper by what it DOES with an options
 * object it cannot honour: it returns checks, or it refuses the options by name. One probe
 * carrying every factory's options read every factory as a helper once each began refusing
 * the options it does not have — an audit that passed over none of them.
 */
function factoriesOf(mod: Readonly<Record<string, unknown>>): string[] {
  return Object.entries(mod)
    .filter(([name, value]) => typeof value === 'function' && /^[a-z]/.test(name))
    .filter(([, value]) => {
      try {
        const made = (value as (options: unknown) => unknown)({ id: 'probe', unknownOption: true });
        return isCheck(made) || (Array.isArray(made) && made.length > 0 && made.every(isCheck));
      } catch (error) {
        return error instanceof CheckOptionsError;
      }
    })
    .map(([name]) => name)
    .sort();
}

describe('@specwarden/plans', () => {
  it('exercises every check factory the package publishes', async () => {
    const mod = (await import('@specwarden/plans')) as Record<string, unknown>;

    expect(factoriesOf(mod)).toEqual([...COVERED].sort());
  });

  it('planChecks: the whole module in one call, green over the clean folder and red over the broken one', async () => {
    const checks = planChecks({
      plansDir: 'docs/_plans',
      archiveDir: 'docs/_archive',
      shape: { nameRe: PLAN_SHAPE_CONVENTION.nameRe, knownGateIds: KNOWN_GATE_IDS },
    });

    expect(checks.map((c) => c.id)).toEqual(['plan-staleness', 'plan-shape', 'decision-log-shape']);
    for (const check of checks) {
      expect(errorsOf(await runCheck(check, { tree: CLEAN, branches: BRANCHES })), check.id).toEqual([]);
      expect((await runCheck(check, { tree: BROKEN, branches: BRANCHES })).ok, check.id).toBe(false);
    }
  });

  it('a plans folder that is not there is a failure naming it, in every check that reads the folder', async () => {
    for (const check of planChecks({ plansDir: 'planning', decisions: false })) {
      expect(errorsOf(await runCheck(check, { tree: CLEAN, branches: BRANCHES }))[0], check.id).toContain(
        'planning does not exist',
      );
    }
  });

  it('planStaleness: an active plan names a branch that still resolves', async () => {
    const check = planStaleness({
      ...ID,
      id: 'plan-staleness',
      plansDir: 'docs/_plans',
      archiveDir: 'docs/_archive',
    });

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
    const check = planStaleness({
      ...ID,
      id: 'plan-staleness',
      plansDir: 'docs/_plans',
      archiveDir: 'docs/_archive',
    });

    const verdict = await runCheck(check, { tree: BROKEN, branches: null });

    expect(errorsOf(verdict).join('\n')).not.toContain('no longer exists');
    expect(verdict.findings.some((f) => f.message.includes('SKIPPED'))).toBe(true);
  });

  it('planShape: a plan names a real gate, sizes nobody, and every phase says when it is done', async () => {
    const check = planShape({
      ...ID,
      id: 'plan-shape',
      ...PLAN_SHAPE_CONVENTION,
      knownGateIds: KNOWN_GATE_IDS,
    });

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
    const check = planShape({ ...ID, id: 'plan-shape', ...PLAN_SHAPE_CONVENTION });
    const roster: ICheckMeta[] = KNOWN_GATE_IDS.map((id) => ({
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
    const check = decisionLogShape({ ...ID, id: 'decision-log-shape', docs: 'docs/_plans/*.md' });

    expect((await runCheck(check, { tree: CLEAN })).ok).toBe(true);

    const verdict = await runCheck(check, { tree: BROKEN });
    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict).join(' ')).toContain('one global bucket');
  });

  it('decisionLogShape: a pathspec that matches nothing is a failure, not a clean run', async () => {
    // The plans folder was renamed and the config was not: every rejection "has a
    // reason", because none was read.
    const check = decisionLogShape({ ...ID, id: 'decision-log-shape', docs: 'planning/*.md' });

    const verdict = await runCheck(check, { tree: CLEAN });
    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)[0]).toContain('examined nothing');
  });
});

// Wired with no `rule`, a module's check was an orphan the moment a register existed —
// and a preset's checks had nowhere to put one. The module knows what its check enforces.
describe('@specwarden/plans — every check names the rule it enforces', () => {
  it('carries an implied rule owned by the package, and a rule the consumer writes wins', () => {
    const built = planChecks({});
    for (const check of built) {
      expect(check.rule, check.id).toEqual(
        expect.objectContaining({ statement: expect.any(String), owner: '@specwarden/plans', implied: true }),
      );
      expect(check.title, check.id).not.toBe(check.id);
    }
    expect(planShape({ id: 'plan-shape', rule: 'ours' }).rule).toEqual({ statement: 'ours' });
  });
});
