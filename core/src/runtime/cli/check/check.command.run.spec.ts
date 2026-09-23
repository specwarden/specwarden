import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CHECK_CONTRACT_VERSION, type ICheck, type IFixable, type IReporter, type IVcs } from '../../../domain';
import { testContext } from '../../../testing';
import { CheckRegistry } from '../../container';
import type { IWardenConfig } from '../../config/config.model';
import type { IParsedArgs } from '../_shared/parse-args/parse-args.util';
import { check } from './check.command';

/**
 * The run path of `check`: what it refuses before anything executes, and what it
 * forwards from argv and the environment to the runner. Every port is a fake from the
 * engine's own testing kit, so nothing here reads the real disk or spawns git.
 */

const args = (over: Partial<IParsedArgs> = {}): IParsedArgs => ({
  command: 'check',
  ids: [],
  positionals: [],
  all: false,
  list: false,
  json: false,
  fix: false,
  tighten: false,
  ifRelevant: false,
  relevance: false,
  showSkipped: false,
  ...over,
});

const aCheck = (id: string, over: Partial<ICheck> = {}): ICheck => ({
  id,
  title: `${id} title`,
  tier: 'fast',
  zone: 'consumer',
  capabilities: [],
  contractVersion: CHECK_CONTRACT_VERSION,
  when: () => true,
  run: () => ({ ok: true, findings: [] }),
  ...over,
});

function setup(checks: readonly ICheck[], config: IWardenConfig = {}, vcs: IVcs = testContext({ changed: [] }).vcs) {
  const registry = new CheckRegistry();
  registry.registerAll(checks);
  const t = testContext();
  const full: IWardenConfig = {
    adapters: () => ({ vcs, files: t.files, clock: t.clock, proc: t.proc }),
    ...config,
  };
  let out = '';
  let err = '';
  const io = { out: (s: string) => (out += s), err: (s: string) => (err += s) };
  return {
    run: (a: Partial<IParsedArgs> = {}, env: NodeJS.ProcessEnv = {}) =>
      check(args(a), full, registry, '/repo', env, io),
    out: () => out,
    err: () => err,
  };
}

/** A check that records that it ran, so "refused before anything ran" is observable. */
function tracer() {
  const ran: string[] = [];
  const make = (id: string, over: Partial<ICheck> = {}) =>
    aCheck(id, {
      run: () => {
        ran.push(id);
        return { ok: true, findings: [] };
      },
      ...over,
    });
  return { ran, make };
}

describe('refused before anything runs', () => {
  it.each([
    ['1of3', 'must be written i/N (for example 1/3); got "1of3"'],
    ['0/0', '--shard "0/0" divides the work into 0 parts'],
    ['0/3', '--shard "0/3" asks for part 0 of 3 — the index runs from 1 to 3'],
    ['4/3', '--shard "4/3" asks for part 4 of 3 — the index runs from 1 to 3'],
  ])('a --shard of %s, with exit 2 and the reason on stderr', async (shard, message) => {
    // A runner that shrugs at a shard it cannot parse runs everything (CI does the
    // suite N times) or nothing (green over no tests). Refused by name instead.
    const t = tracer();
    const s = setup([t.make('a')]);
    expect(await s.run({ shard })).toBe(2);
    expect(s.err()).toContain(message);
    expect(s.out()).toBe('');
    expect(t.ran).toEqual([]);
  });

  it('accepts the boundary shards 1/1 and 3/3', async () => {
    for (const shard of ['1/1', '3/3']) expect(await setup([aCheck('a')]).run({ shard })).toBe(0);
  });

  it('an unknown --reporter, naming the ones that exist', async () => {
    const t = tracer();
    const s = setup([t.make('a')]);
    expect(await s.run({ reporter: 'sarif' })).toBe(2);
    expect(s.err()).toBe('unknown reporter "sarif" — expected one of: tty, json, github\n');
    expect(t.ran).toEqual([]);
  });

  it('an unknown --id, with exit 2 rather than a green run over the checks that do exist', async () => {
    const t = tracer();
    const s = setup([t.make('a')]);
    expect(await s.run({ ids: ['a', 'typo'] })).toBe(2);
    expect(s.err()).toBe("unknown check id 'typo'\n");
    expect(t.ran).toEqual([]);
  });

  it('an unknown id in SPECWARDEN_SKIP, locally', async () => {
    const s = setup([aCheck('a')]);
    expect(await s.run({}, { SPECWARDEN_SKIP: 'typo' })).toBe(2);
    expect(s.err()).toContain('unknown check id(s) in skip: typo');
  });
});

describe('what the environment means', () => {
  it('ignores SPECWARDEN_SKIP under CI=true — a skip that reaches the arbiter is a hole', async () => {
    const t = tracer();
    const s = setup([t.make('a')]);
    expect(await s.run({}, { SPECWARDEN_SKIP: 'a', CI: 'true' })).toBe(0);
    expect(t.ran).toEqual(['a']);
  });

  it('ignores SPECWARDEN_SKIP inside GitHub Actions even without CI set', async () => {
    const t = tracer();
    const s = setup([t.make('a')]);
    await s.run({ reporter: 'tty' }, { SPECWARDEN_SKIP: 'a', GITHUB_ACTIONS: 'true' });
    expect(t.ran).toEqual(['a']);
  });

  it('honours SPECWARDEN_SKIP locally', async () => {
    const t = tracer();
    const s = setup([t.make('a'), t.make('b')]);
    expect(await s.run({}, { SPECWARDEN_SKIP: 'a' })).toBe(0);
    expect(t.ran).toEqual(['b']);
  });

  it('diffs against --base when given, else SPECWARDEN_BASE', async () => {
    const bases: (string | undefined)[] = [];
    const base = testContext({ changed: [] }).vcs;
    const vcs: IVcs = {
      ...base,
      changedFiles: (b) => {
        bases.push(b);
        return [];
      },
    };
    const s = setup([aCheck('a')], {}, vcs);
    await s.run({ base: 'origin/main' }, { SPECWARDEN_BASE: 'origin/dev' });
    await s.run({}, { SPECWARDEN_BASE: 'origin/dev' });
    expect(bases).toEqual(['origin/main', 'origin/dev']);
  });
});

describe('the full-run note', () => {
  it('says why relevance did not apply, so a full run can be told from a tier nobody filtered', async () => {
    const s = setup([aCheck('a')]);
    await s.run({ all: true });
    expect(s.out()).toContain('ℹ full run — no relevance filter: requested explicitly (--all / SPECWARDEN_ALL)\n');
  });

  it('is printed for SPECWARDEN_ALL=1 as well as for --all', async () => {
    const s = setup([aCheck('a')]);
    await s.run({}, { SPECWARDEN_ALL: '1' });
    expect(s.out()).toContain('ℹ full run');
  });

  it('is absent from a filtered run, which skips what the diff cannot affect', async () => {
    const t = tracer();
    const s = setup(
      [t.make('db', { when: (c) => c.includes('db.sql') }), t.make('any')],
      {},
      testContext({ changed: ['README.md'] }).vcs,
    );
    expect(await s.run()).toBe(0);
    expect(s.out()).not.toContain('full run');
    expect(t.ran).toEqual(['any']);
  });

  it('never enters --json output, which must stay ONE parseable document', async () => {
    const s = setup([aCheck('a')]);
    await s.run({ all: true, json: true });
    const doc = JSON.parse(s.out()) as { results: { id: string }[] };
    expect(doc.results.map((r) => r.id)).toEqual(['a']);
  });
});

describe('flags forwarded to the runner', () => {
  it('exits 1 when a blocking check fails, and 0 when only an advisory one does', async () => {
    const red = { run: () => ({ ok: false, findings: [{ severity: 'error' as const, message: 'no' }] }) };
    expect(await setup([aCheck('a', red)]).run()).toBe(1);
    expect(await setup([aCheck('a', { ...red, advisory: true })]).run()).toBe(0);
  });

  it('--jobs wins over the config’s concurrency, in both directions', async () => {
    // Observed as the largest number of checks in flight at once.
    const measure = async (a: Partial<IParsedArgs>, concurrency?: number) => {
      let inFlight = 0;
      let peak = 0;
      const slow = (id: string) =>
        aCheck(id, {
          run: async () => {
            peak = Math.max(peak, ++inFlight);
            await new Promise((r) => setTimeout(r, 15));
            inFlight--;
            return { ok: true, findings: [] };
          },
        });
      await setup([slow('a'), slow('b'), slow('c')], { concurrency }).run(a);
      return peak;
    };
    expect(await measure({}, 3)).toBe(3);
    expect(await measure({ jobs: '1' }, 3)).toBe(1);
    expect(await measure({ jobs: '2' })).toBe(2);
    expect(await measure({})).toBe(1);
  });

  it('--fix reaches a fixable check, and a run without it never writes', async () => {
    const fixed: string[] = [];
    const fixable: ICheck & IFixable = {
      ...aCheck('f', { run: () => ({ ok: fixed.length > 0, findings: [] }) }),
      fix: () => {
        fixed.push('f');
        return { fixed: 1 };
      },
    };
    expect(await setup([fixable]).run()).toBe(1);
    expect(fixed).toEqual([]);
    expect(await setup([fixable]).run({ fix: true })).toBe(0);
    expect(fixed).toEqual(['f']);
  });

  it('denies a capability the config refuses, failing that check by name without running it', async () => {
    const t = tracer();
    const s = setup([t.make('net', { capabilities: ['net'] })], { denyCapabilities: ['net'] });
    expect(await s.run({ reporter: 'tty' })).toBe(1);
    expect(t.ran).toEqual([]);
    expect(s.out()).toContain('which this repository denies');
  });

  it('--tighten records a ratchet in <root>/.specwarden/ratchets/<id>.json, the file a repository commits', async () => {
    // The default store is the subject, so the root is a real directory. A ratchet
    // written anywhere else is a number the next clone never sees.
    const root = mkdtempSync(join(tmpdir(), 'spw-ratchet-'));
    try {
      const registry = new CheckRegistry();
      registry.registerAll([
        aCheck('counted', {
          ratchet: { id: 'todo-count' },
          run: () => ({ ok: true, findings: [], ratchet: { value: 4 } }),
        }),
      ]);
      const t = testContext({ changed: [] });
      const code = await check(
        args({ tighten: true }),
        { adapters: () => ({ vcs: t.vcs, files: t.files, clock: t.clock }) },
        registry,
        root,
        {},
        { out: () => {}, err: () => {} },
      );
      expect(code).toBe(0);
      const stored = JSON.parse(readFileSync(join(root, '.specwarden', 'ratchets', 'todo-count.json'), 'utf8'));
      expect(stored).toMatchObject({ value: 4 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('lets a fault outside any check propagate, rather than reporting it as a usage error', async () => {
    // Exit 2 means "you called it wrong". A reporter that throws is the engine's
    // fault, and dressing it as the caller's would send them to re-read the docs.
    const broken: IReporter = {
      checkStarted: () => {
        throw new Error('reporter exploded');
      },
      checkFinished: () => {},
      runFinished: () => {},
    };
    const s = setup([aCheck('a')], { reporter: () => broken });
    await expect(s.run()).rejects.toThrow('reporter exploded');
  });
});
