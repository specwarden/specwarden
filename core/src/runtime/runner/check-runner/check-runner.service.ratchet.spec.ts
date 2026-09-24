import { beforeEach, describe, expect, it } from 'vitest';

import type { ICheck, TRatchetDirection } from '../../../domain';

import { CheckRunner } from './check-runner.service';
import { adapters, check, ratchetBacking, recordingReporter, rosterOf } from './check-runner.service.spec-helpers';

/**
 * `--tighten` records a measurement only from a PASSING verdict, and never past the
 * ceiling the check declares. Both limits are defects on record: a red run at 3 over a
 * bar of 0 wrote 3 and the next run was green; a run at 4 over a ceiling of 3 wrote 4,
 * and the audit that caught it told the reader to run `--tighten`.
 */
const ratcheted = (
  measured: number,
  ok: boolean,
  ratchet: { ceiling?: number; direction?: TRatchetDirection } = {},
): ICheck => ({
  ...check({ id: 'ratcheted' }),
  ratchet: { id: 'r', ...ratchet },
  run: () => ({ ok, findings: [], measured: measured }),
});

const tighten = (c: ICheck) =>
  new CheckRunner(rosterOf([c]), adapters([]), recordingReporter().reporter).run(
    { all: true, tighten: true },
    { ci: false },
  );

describe('--tighten', () => {
  beforeEach(() => ratchetBacking.clear());

  it('records nothing for a check that FAILED — its count is the regression, not a new bar', async () => {
    await tighten(ratcheted(3, false));
    expect(ratchetBacking.has('r')).toBe(false);
    ratchetBacking.set('r', 1);
    await tighten(ratcheted(3, false));
    expect(ratchetBacking.get('r')).toBe(1);
  });

  it('records a passing measurement, as before', async () => {
    await tighten(ratcheted(1, true, { ceiling: 3 }));
    expect(ratchetBacking.get('r')).toBe(1);
  });

  it('never writes above the ceiling the check declares, however the verdict passed', async () => {
    ratchetBacking.set('r', 9); // a hand-edited file, above what the check tolerates
    await tighten(ratcheted(4, true, { ceiling: 3 }));
    expect(ratchetBacking.get('r')).toBe(3);
  });

  it('a floor is never written below its declared floor', async () => {
    await tighten(ratcheted(70, true, { ceiling: 80, direction: 'up' }));
    expect(ratchetBacking.get('r')).toBe(80);
  });

  it('a check with no ratchet writes nothing', async () => {
    await tighten(check({ id: 'plain' }));
    expect(ratchetBacking.size).toBe(0);
  });
});

/**
 * A CI checkout builds a commit that is already pushed, so the pre-push range — the
 * commits not yet on a remote — is empty by construction. It was read as "nothing
 * changed": the job ran only the always-on checks and exited 0, with no reason printed.
 */
describe('relevance under CI with no base', () => {
  const scoped = (): ICheck => check({ id: 'scoped', when: (changed) => changed.includes('src/a.ts') });

  it('an empty range under CI is "cannot tell": everything runs, and the run says why', async () => {
    const { reporter, ran } = recordingReporter();
    const outcome = await new CheckRunner(rosterOf([scoped()]), adapters([]), reporter).run({}, { ci: true });
    expect(ran).toEqual(['scoped']);
    expect(outcome.fullRunReason).toBe(
      'under CI with no --base, the unpushed range is empty and cannot tell what changed — pass --base <ref> for a filtered run',
    );
  });

  it('`--relevance` answers from the same derivation', () => {
    const runner = new CheckRunner(rosterOf([scoped()]), adapters([]), recordingReporter().reporter);
    expect(runner.relevanceOf('scoped', {}, { ci: true })).toBe('run');
    expect(runner.relevanceOf('scoped', {}, { ci: false })).toBe('skip');
  });

  it('locally, an empty unpushed range is still "nothing changed" — the pre-push reading is honest', async () => {
    const { reporter, ran } = recordingReporter();
    const outcome = await new CheckRunner(rosterOf([scoped()]), adapters([]), reporter).run({}, { ci: false });
    expect([ran, outcome.fullRunReason]).toEqual([[], undefined]);
  });

  it('with a base, an empty diff under CI is a real empty diff, filtered as one', async () => {
    const { reporter, ran } = recordingReporter();
    const outcome = await new CheckRunner(rosterOf([scoped()]), adapters([]), reporter).run(
      { base: 'origin/main' },
      { ci: true },
    );
    expect([ran, outcome.fullRunReason]).toEqual([[], undefined]);
  });

  it('a non-empty range under CI is filtered as usual', async () => {
    const { reporter, ran } = recordingReporter();
    await new CheckRunner(rosterOf([scoped()]), adapters(['docs/x.md']), reporter).run({}, { ci: true });
    expect(ran).toEqual([]);
  });
});

describe('--tighten over a check that could not look', () => {
  beforeEach(() => ratchetBacking.clear());

  // It measured nothing; recording its zero would pin a bar no run where the files live meets.
  it('records nothing', async () => {
    await tighten({
      ...check({ id: 'blind' }),
      ratchet: { id: 'r' },
      run: () => ({ ok: true, findings: [], measured: 0, skipped: 'the env files are not on this machine' }),
    });
    expect(ratchetBacking.has('r')).toBe(false);
  });
});
