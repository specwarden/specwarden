import { describe, expect, it } from 'vitest';

import { testContext } from '../../../testing';
import { isCi } from './check.command';
import { aCheck, setup, tracer } from './check.command.spec-helpers';

/**
 * What the environment and the line mean before a run starts: which values are CI, which
 * `--jobs` and `--base` are usable, and where the full-run note goes when stdout belongs
 * to a machine.
 */

describe('what counts as CI', () => {
  // Only `CI=true` counted, so under `CI=1` a skip reached the arbiter and a red gate
  // exited 0 — and ANY `GITHUB_ACTIONS` counted, `false` included.
  it.each([
    [{ CI: 'true' }, true],
    [{ CI: '1' }, true],
    [{ CI: 'True' }, true],
    [{ CI: 'yes' }, true],
    [{ CI: '' }, false],
    [{ CI: 'false' }, false],
    [{ CI: 'FALSE' }, false],
    [{ CI: '0' }, false],
    [{ GITHUB_ACTIONS: 'true' }, true],
    [{ GITHUB_ACTIONS: 'false' }, false],
    [{}, false],
  ])('%j is CI: %s', (env, ci) => {
    expect(isCi(env)).toBe(ci);
  });

  it('under CI=1 a SPECWARDEN_SKIP is ignored — the red gate runs, and fails', async () => {
    const red = aCheck('a', { run: () => ({ ok: false, findings: [{ severity: 'error', message: 'no' }] }) });
    expect(await setup([red]).run({}, { SPECWARDEN_SKIP: 'a', CI: '1' })).toBe(1);
  });
});

describe('--jobs and --base, refused by name before anything runs', () => {
  it.each(['abc', '0', '-3', '1.5', ''])('--jobs %j exits 2 — it ran serially and exited 0', async (jobs) => {
    const t = tracer();
    const s = setup([t.make('a')]);
    expect(await s.run({ jobs })).toBe(2);
    expect(s.err()).toBe(`--jobs must be a positive whole number of checks to run at once; got "${jobs}"\n`);
    expect(t.ran).toEqual([]);
  });

  it('an explicit --base that does not resolve exits 2, naming it — it was the fail-safe full run, exit 0', async () => {
    const t = tracer();
    const s = setup([t.make('a')], {}, { ...testContext({ changed: [] }).vcs, refExists: () => false });
    expect(await s.run({ base: 'no-such-ref' })).toBe(2);
    expect(s.err()).toBe(
      '--base no-such-ref does not resolve to a commit here — name a branch, a tag or a commit that exists.\n',
    );
    expect(t.ran).toEqual([]);
  });

  it('SPECWARDEN_BASE stays fail-safe — a job-wide value, never printed', async () => {
    const s = setup([aCheck('a')], {}, { ...testContext().vcs, refExists: () => false, changedFiles: () => undefined });
    expect(await s.run({}, { SPECWARDEN_BASE: 'S3CR3T' })).toBe(0);
    expect(s.out() + s.err()).not.toContain('S3CR3T');
  });
});

describe('the full-run note, for a machine reporter', () => {
  it('goes to stderr under --reporter json, so stdout is ONE document', async () => {
    const s = setup([aCheck('a')]);
    await s.run({ all: true, reporter: 'json' });
    expect((JSON.parse(s.out()) as { results: unknown[] }).results).toHaveLength(1);
    expect(s.err()).toContain('ℹ full run — no relevance filter: requested explicitly');
  });

  it('goes to stderr for the github reporter, and for a consumer’s own', async () => {
    const gh = setup([aCheck('a')]);
    await gh.run({ all: true }, { GITHUB_ACTIONS: 'true' });
    expect([gh.out().includes('full run'), gh.err().includes('full run')]).toEqual([false, true]);
    const own = setup([aCheck('a')], {
      reporter: () => ({ checkStarted: () => {}, checkFinished: () => {}, runFinished: () => {} }),
    });
    await own.run({ all: true });
    expect([own.out(), own.err().includes('full run')]).toEqual(['', true]);
  });

  it('stays on stdout for the terminal', async () => {
    const s = setup([aCheck('a')]);
    await s.run({ all: true, reporter: 'tty' });
    expect([s.out().includes('full run'), s.err()]).toEqual([true, '']);
  });
});
