import { describe, expect, it } from 'vitest';

import { CheckRegistry } from '../../container/check-registry/check-registry.service';
import { CheckRunner, RunnerUsageError } from './check-runner.service';
import { adapters, check, recordingReporter, registryOf } from './check-runner.service.spec-helpers';

describe('CheckRunner selection', () => {
  it('runs only the requested tier', async () => {
    const reg = registryOf([check({ id: 'f', tier: 'fast' }), check({ id: 'h', tier: 'heavy' })]);
    const { reporter, ran } = recordingReporter();
    await new CheckRunner(reg, adapters([]), reporter).run({ tier: 'fast' }, { ci: false });
    expect(ran).toEqual(['f']);
  });

  it('applies the relevance predicate against the changed set', async () => {
    const reg = registryOf([
      check({ id: 'server', when: (c) => c.some((f) => f.startsWith('a/')) }),
      check({ id: 'always' }),
    ]);
    const { reporter, ran } = recordingReporter();
    await new CheckRunner(reg, adapters(['b/x']), reporter).run({ tier: 'fast' }, { ci: false });
    expect(ran).toEqual(['always']); // 'server' filtered out — nothing under a/
  });

  it('an unknowable changed set runs everything, never nothing', async () => {
    const reg = registryOf([check({ id: 'x', when: () => false })]);
    const { reporter, ran } = recordingReporter();
    await new CheckRunner(reg, adapters(undefined), reporter).run({ tier: 'fast' }, { ci: false });
    expect(ran).toEqual(['x']); // when()=false, but changed=undefined overrides
  });

  it('--all ignores relevance', async () => {
    const reg = registryOf([check({ id: 'x', when: () => false })]);
    const { reporter, ran } = recordingReporter();
    await new CheckRunner(reg, adapters(['unrelated']), reporter).run({ tier: 'fast', all: true }, { ci: false });
    expect(ran).toEqual(['x']);
  });

  it('--id runs exactly the named checks, ignoring relevance; unknown id is a usage error', async () => {
    const reg = registryOf([check({ id: 'one', when: () => false }), check({ id: 'two' })]);
    const { reporter, ran } = recordingReporter();
    await new CheckRunner(reg, adapters(['x']), reporter).run({ ids: ['one'] }, { ci: false });
    expect(ran).toEqual(['one']);
    await expect(new CheckRunner(reg, adapters([]), reporter).run({ ids: ['nope'] }, { ci: false })).rejects.toThrow(
      RunnerUsageError,
    );
  });

  it('--id is repeatable: several ids run in the order given, ignoring relevance', async () => {
    const reg = registryOf([check({ id: 'one', when: () => false }), check({ id: 'two', when: () => false })]);
    const { reporter, ran } = recordingReporter();
    await new CheckRunner(reg, adapters([]), reporter).run({ ids: ['two', 'one'] }, { ci: false });
    expect(ran).toEqual(['two', 'one']);
  });

  it('a shared-build-input change makes every check relevant, filter or not', async () => {
    const reg = registryOf([check({ id: 'x', when: (c) => c.some((f) => f.startsWith('a/')) })]);
    const { reporter, ran } = recordingReporter();
    await new CheckRunner(reg, adapters(['pnpm-lock.yaml']), reporter).run(
      { tier: 'fast', sharedBuildInputs: ['pnpm-lock.yaml'] },
      { ci: false },
    );
    expect(ran).toEqual(['x']); // when() is false for the lockfile, but it is a shared input
  });

  it('--if-relevant applies the relevance filter even to a named id', async () => {
    const reg = registryOf([check({ id: 'one', when: () => false })]);
    const { reporter, ran } = recordingReporter();
    await new CheckRunner(reg, adapters(['unrelated']), reporter).run(
      { ids: ['one'], ifRelevant: true },
      { ci: false },
    );
    expect(ran).toEqual([]); // named, but not relevant, and ifRelevant is on → skipped
  });

  /**
   * The size trigger, both directions. A trigger that never fires and a trigger that
   * always fires are indistinguishable from the tier they replaced, so each case pins
   * one side of the threshold.
   */
  it('a diff wider than the file trigger drops relevance, and one just under it does not', async () => {
    const reg = registryOf([check({ id: 'x', when: () => false })]);
    const wide = Array.from({ length: 5 }, (_, i) => `client/src/x${i}.tsx`);

    const hit = recordingReporter();
    const over = await new CheckRunner(reg, adapters(wide), hit.reporter).run(
      { tier: 'fast', fullRunTriggers: { files: 5 } },
      { ci: false },
    );
    expect(hit.ran).toEqual(['x']);
    expect(over.fullRunReason).toMatch(/5 files changed \(trigger: 5\)/);

    const miss = recordingReporter();
    const under = await new CheckRunner(reg, adapters(wide.slice(0, 4)), miss.reporter).run(
      { tier: 'fast', fullRunTriggers: { files: 5 } },
      { ci: false },
    );
    expect(miss.ran).toEqual([]);
    expect(under.fullRunReason).toBeUndefined();
  });

  it('a diff longer than the line trigger drops relevance, and one just under it does not', async () => {
    const reg = registryOf([check({ id: 'x', when: () => false })]);

    const hit = recordingReporter();
    const over = await new CheckRunner(reg, adapters(['client/src/x.tsx'], 9000), hit.reporter).run(
      { tier: 'fast', fullRunTriggers: { lines: 9000 } },
      { ci: false },
    );
    expect(hit.ran).toEqual(['x']);
    expect(over.fullRunReason).toMatch(/9000 lines changed/);

    const miss = recordingReporter();
    await new CheckRunner(reg, adapters(['client/src/x.tsx'], 8999), miss.reporter).run(
      { tier: 'fast', fullRunTriggers: { lines: 9000 } },
      { ci: false },
    );
    expect(miss.ran).toEqual([]);
  });

  it('an uncountable line total is not grounds for a full run — the file list was readable', async () => {
    const reg = registryOf([check({ id: 'x', when: () => false })]);
    const { reporter, ran } = recordingReporter();
    await new CheckRunner(reg, adapters(['client/src/x.tsx'], undefined), reporter).run(
      { tier: 'fast', fullRunTriggers: { lines: 1 } },
      { ci: false },
    );
    expect(ran).toEqual([]);
  });

  it('declaring no trigger disables size entirely', async () => {
    const reg = registryOf([check({ id: 'x', when: () => false })]);
    const { reporter, ran } = recordingReporter();
    const outcome = await new CheckRunner(
      reg,
      adapters(
        Array.from({ length: 500 }, (_, i) => `f${i}.ts`),
        99999,
      ),
      reporter,
    ).run({ tier: 'fast' }, { ci: false });
    expect(ran).toEqual([]);
    expect(outcome.fullRunReason).toBeUndefined();
  });

  it('names WHY relevance was dropped — a shared input, a wide diff, an unreadable range, --all', async () => {
    const reg = registryOf([check({ id: 'x' })]);
    const rep = recordingReporter().reporter;
    const shared = await new CheckRunner(reg, adapters(['pnpm-lock.yaml']), rep).run(
      { tier: 'fast', sharedBuildInputs: ['pnpm-lock.yaml'] },
      { ci: false },
    );
    expect(shared.fullRunReason).toContain('pnpm-lock.yaml');
    const unreadable = await new CheckRunner(reg, adapters(undefined), rep).run({ tier: 'fast' }, { ci: false });
    expect(unreadable.fullRunReason).toMatch(/could not be read/);
    const explicit = await new CheckRunner(reg, adapters(['a']), rep).run({ tier: 'fast', all: true }, { ci: false });
    expect(explicit.fullRunReason).toMatch(/explicitly/);
    const filtered = await new CheckRunner(reg, adapters(['a']), rep).run({ tier: 'fast' }, { ci: false });
    expect(filtered.fullRunReason).toBeUndefined();
  });

  /**
   * A shared input may carry its own reason, and it is reported verbatim. The generic
   * fallback ("what it resolves to may have moved") is right for a lockfile and WRONG
   * for a schema migration, and a wrong reason in a run summary gets acted on.
   */
  it('reports a shared input’s own reason when it declares one', async () => {
    const reg = registryOf([check({ id: 'x', when: () => false })]);
    const { reporter, ran } = recordingReporter();
    const outcome = await new CheckRunner(reg, adapters(['db/migrations/0001.sql']), reporter).run(
      {
        tier: 'fast',
        sharedBuildInputs: [{ prefix: 'db/migrations/', why: 'a migration — the old code meets the new schema' }],
      },
      { ci: false },
    );
    expect(ran).toEqual(['x']);
    expect(outcome.fullRunReason).toBe('db/migrations/0001.sql — a migration — the old code meets the new schema');
  });

  it('falls back to a generic reason for a bare prefix, and both forms mix', async () => {
    const reg = registryOf([check({ id: 'x', when: () => false })]);
    const outcome = await new CheckRunner(reg, adapters(['lock.file']), recordingReporter().reporter).run(
      { tier: 'fast', sharedBuildInputs: [{ prefix: 'db/' }, 'lock.file'] },
      { ci: false },
    );
    expect(outcome.fullRunReason).toContain('shared build input');
  });

  // A CI job asks relevanceOf to decide whether to pay for a database. If it answered
  // differently from the run, the run would then insist on a gate whose setup was skipped.
  it('relevanceOf agrees with the run on the size trigger', () => {
    const reg = registryOf([check({ id: 'server', when: () => false })]);
    const wide = Array.from({ length: 5 }, (_, i) => `client/src/x${i}.tsx`);
    const runner = new CheckRunner(reg, adapters(wide), recordingReporter().reporter);
    expect(runner.relevanceOf('server', { fullRunTriggers: { files: 5 } }, { ci: false })).toBe('run');
    expect(runner.relevanceOf('server', { fullRunTriggers: { files: 6 } }, { ci: false })).toBe('skip');
  });

  it('relevanceOf answers run/skip without running, honouring shared inputs', () => {
    const reg = registryOf([check({ id: 'server', when: (c) => c.some((f) => f.startsWith('server/')) })]);
    const runner = new CheckRunner(reg, adapters(['other/x']), recordingReporter().reporter);
    expect(runner.relevanceOf('server', {}, { ci: false })).toBe('skip');
    const relevant = new CheckRunner(reg, adapters(['server/y']), recordingReporter().reporter);
    expect(relevant.relevanceOf('server', {}, { ci: false })).toBe('run');
    const shared = new CheckRunner(reg, adapters(['package.json']), recordingReporter().reporter);
    expect(shared.relevanceOf('server', { sharedBuildInputs: ['package.json'] }, { ci: false })).toBe('run');
    expect(() => runner.relevanceOf('nope', {}, { ci: false })).toThrow(RunnerUsageError);
  });
});

describe('CheckRunner passes the shard through to checks', () => {
  it('forwards --shard via the context', async () => {
    let seen: string | undefined = 'unset';
    const reg = registryOf([
      check({
        id: 's',
        capabilities: [],
        run: (ctx: ICheckContext) => {
          seen = ctx.shard;
          return { ok: true, findings: [] };
        },
      }),
    ]);
    await new CheckRunner(reg, adapters([]), recordingReporter().reporter).run(
      { tier: 'fast', shard: '1/3' },
      { ci: false },
    );
    expect(seen).toBe('1/3');
  });
});

describe('CheckRunner selection — an unknown id that is a file name', () => {
  // `--id <file name>` found nothing when the file declared another id, with no clue why.
  it('names the file and the id it declares', async () => {
    const declared = check({ id: 'no-todos' });
    const reg = new CheckRegistry({
      originOf: (c) => (c === declared ? '.specwarden/checks/hygiene/no-todo.check.mjs' : undefined),
    });
    reg.register(declared);
    const run = new CheckRunner(reg, adapters([]), recordingReporter().reporter).run(
      { ids: ['no-todo'] },
      { ci: false },
    );
    await expect(run).rejects.toThrow(
      "unknown check id 'no-todo' — .specwarden/checks/hygiene/no-todo.check.mjs declares 'no-todos'",
    );
  });

  it('says only that the id is unknown when no file carries the name', async () => {
    const run = new CheckRunner(registryOf([check({ id: 'a' })]), adapters([]), recordingReporter().reporter).run(
      { ids: ['nope'] },
      { ci: false },
    );
    await expect(run).rejects.toThrow(/^unknown check id 'nope'$/);
  });
});

describe('CheckRunner — a check that could not look', () => {
  const blind = (over = {}) =>
    check({
      id: 'blind',
      verdict: { ok: true, findings: [], skipped: 'the env files are not on this machine', ...over },
    });

  // It was a pass: a green tick beside a note that read SKIPPED.
  it('is reported as skipped, cannot-tell, and fails nothing', async () => {
    const { exitCode, results } = await new CheckRunner(
      registryOf([blind()]),
      adapters([]),
      recordingReporter().reporter,
    ).run({ all: true }, { ci: false });
    expect(exitCode).toBe(0);
    expect(results[0].skipped).toBe('cannot-tell');
  });

  it('is judged on its findings when it found a defect — it did look', async () => {
    const found = blind({ ok: false, findings: [{ severity: 'error', message: 'x' }] });
    const { exitCode, results } = await new CheckRunner(
      registryOf([found]),
      adapters([]),
      recordingReporter().reporter,
    ).run({ all: true }, { ci: false });
    expect([exitCode, results[0].skipped]).toEqual([1, undefined]);
  });

  it('a blank reason is no reason', async () => {
    const { results } = await new CheckRunner(
      registryOf([blind({ skipped: '  ' })]),
      adapters([]),
      recordingReporter().reporter,
    ).run({ all: true }, { ci: false });
    expect(results[0].skipped).toBeUndefined();
  });
});
