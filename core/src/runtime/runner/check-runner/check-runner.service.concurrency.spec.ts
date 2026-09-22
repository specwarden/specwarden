import { describe, expect, it } from 'vitest';

import { CheckRunner } from './check-runner.service';
import { adapters, check, recordingReporter, registryOf } from './check-runner.service.spec-helpers';

/**
 * Concurrency, and the two things it must not cost.
 *
 * On this repository the fast tier spends about three quarters of its wall clock
 * inside external commands, one at a time. Overlapping them is the only change that
 * moves that number — the engine's own checks already run in fractions of a second.
 *
 * What it may not cost: a deterministic REPORT (a run whose output order changes
 * between runs cannot be diffed, and a reader loses the ability to compare two runs at
 * a glance), and correctness under `--fix`/`--tighten`, which write.
 */

/** A check that records when it starts and finishes, and takes a real tick to run. */
function timed(id: string, log: string[], ms = 20) {
  return check({
    id,
    run: async () => {
      log.push(`start:${id}`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`end:${id}`);
      return { ok: true, findings: [] };
    },
  });
}

const ENV = { ci: false, all: true };

describe('by default nothing overlaps', () => {
  it('finishes each check before starting the next', async () => {
    const log: string[] = [];
    const { reporter } = recordingReporter();
    const runner = new CheckRunner(registryOf([timed('a', log), timed('b', log)]), adapters([]), reporter);
    await runner.run({ all: true }, ENV);
    expect(log).toEqual(['start:a', 'end:a', 'start:b', 'end:b']);
  });
});

describe('concurrency overlaps the work', () => {
  it('starts the second before the first has finished', async () => {
    const log: string[] = [];
    const { reporter } = recordingReporter();
    const runner = new CheckRunner(registryOf([timed('a', log), timed('b', log)]), adapters([]), reporter);
    await runner.run({ all: true, concurrency: 2 }, ENV);
    expect(log.slice(0, 2)).toEqual(['start:a', 'start:b']);
  });

  it('never runs more at once than it was allowed', async () => {
    const log: string[] = [];
    const checks = ['a', 'b', 'c', 'd'].map((id) => timed(id, log));
    const { reporter } = recordingReporter();
    await new CheckRunner(registryOf(checks), adapters([]), reporter).run({ all: true, concurrency: 2 }, ENV);

    let live = 0;
    let peak = 0;
    for (const entry of log) {
      live += entry.startsWith('start:') ? 1 : -1;
      peak = Math.max(peak, live);
    }
    expect(peak).toBe(2);
  });
});

describe('the report stays deterministic', () => {
  it('returns results in registry order however they finished', async () => {
    // The slow one is first, so a naive implementation reporting on completion would
    // put it last — and two runs of the same tree would print different orders.
    const log: string[] = [];
    const checks = [timed('slow', log, 40), timed('fast', log, 1)];
    const { reporter } = recordingReporter();
    const out = await new CheckRunner(registryOf(checks), adapters([]), reporter).run({ all: true, concurrency: 2 }, ENV);
    expect(out.results.map((r) => r.meta.id)).toEqual(['slow', 'fast']);
  });
});

describe('writing runs alone', () => {
  it('ignores concurrency under --tighten, which mutates the ratchet store', async () => {
    const log: string[] = [];
    const { reporter } = recordingReporter();
    const runner = new CheckRunner(registryOf([timed('a', log), timed('b', log)]), adapters([]), reporter);
    await runner.run({ all: true, concurrency: 4, tighten: true }, ENV);
    expect(log).toEqual(['start:a', 'end:a', 'start:b', 'end:b']);
  });

  it('ignores concurrency under --fix, which writes to the tree', async () => {
    const log: string[] = [];
    const { reporter } = recordingReporter();
    const runner = new CheckRunner(registryOf([timed('a', log), timed('b', log)]), adapters([]), reporter);
    await runner.run({ all: true, concurrency: 4, fix: true }, ENV);
    expect(log).toEqual(['start:a', 'end:a', 'start:b', 'end:b']);
  });
});

describe('an exclusive check runs alone', () => {
  it('does not overlap with its neighbours', async () => {
    const log: string[] = [];
    const checks = [timed('a', log), { ...timed('lonely', log), exclusive: true }, timed('b', log)];
    const { reporter } = recordingReporter();
    await new CheckRunner(registryOf(checks), adapters([]), reporter).run({ all: true, concurrency: 3 }, ENV);

    // Whatever else overlaps, nothing is in flight while the exclusive one runs.
    const open = new Set<string>();
    for (const entry of log) {
      const [event, id] = entry.split(':');
      if (event === 'start') {
        if (id === 'lonely') expect([...open]).toEqual([]);
        else expect(open.has('lonely')).toBe(false);
        open.add(id);
      } else {
        open.delete(id);
      }
    }
  });

  it('still reports in registry order', async () => {
    const log: string[] = [];
    const checks = [timed('a', log, 30), { ...timed('lonely', log, 1), exclusive: true }, timed('b', log, 1)];
    const { reporter } = recordingReporter();
    const out = await new CheckRunner(registryOf(checks), adapters([]), reporter).run({ all: true, concurrency: 3 }, ENV);
    expect(out.results.map((r) => r.meta.id)).toEqual(['a', 'lonely', 'b']);
  });
});
