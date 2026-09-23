import { describe, expect, it } from 'vitest';

import { decisionLogShape, planShape, planStaleness } from '@specwarden/plans';
import { CHECK_CONTRACT_VERSION, type ICheckMeta, errorsOf, runCheck, uncoveredFactories } from 'specwarden';

import { BRANCHES, BROKEN, CLEAN, COVERED, KNOWN_GATE_IDS, PLAN_SHAPE_CONVENTION, PROBE } from './repository';

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

describe('@specwarden/plans', () => {
  it('exercises every check factory the package publishes', async () => {
    const mod = (await import('@specwarden/plans')) as Record<string, unknown>;

    expect(uncoveredFactories(mod, { covered: COVERED, probe: PROBE })).toEqual([]);
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
    expect(errorsOf(verdict).join(' ')).toContain('free-text amount field');
  });
});
