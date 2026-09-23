import { describe, expect, it } from 'vitest';

import { CHECK_CONTRACT_VERSION, type ICheck, type IVcs } from '../../../domain';
import { testContext } from '../../../testing';
import { CheckRegistry } from '../../container';
import type { IWardenConfig } from '../../config/config.model';
import type { IParsedArgs } from '../_shared/parse-args/parse-args.util';
import { check } from './check.command';

/**
 * The two questions asked ABOUT a run rather than by one: `--list` (what would be
 * selected) and `--relevance` (would this one gate run). Both must answer from the same
 * selection the run uses and must run nothing — a CI job that asks "would it run?" and
 * gets the gate's side effects instead has paid for the thing it was trying to skip.
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
  help: false,
  problems: [],
  ...over,
});

/** A check that fails the test if it is ever executed. */
const inert = (id: string, over: Partial<ICheck> = {}): ICheck => ({
  id,
  title: `${id} title`,
  tier: 'fast',
  zone: 'consumer',
  capabilities: [],
  contractVersion: CHECK_CONTRACT_VERSION,
  when: () => true,
  run: () => {
    throw new Error(`${id} must not run under a query`);
  },
  ...over,
});

function setup(checks: readonly ICheck[], vcs: IVcs = testContext({ changed: [] }).vcs) {
  const registry = new CheckRegistry();
  registry.registerAll(checks);
  const t = testContext();
  const config: IWardenConfig = { adapters: () => ({ vcs, files: t.files, clock: t.clock, proc: t.proc }) };
  let out = '';
  let err = '';
  const io = { out: (s: string) => (out += s), err: (s: string) => (err += s) };
  return {
    run: (a: Partial<IParsedArgs>, env: NodeJS.ProcessEnv = {}) => check(args(a), config, registry, '/repo', env, io),
    out: () => out,
    err: () => err,
  };
}

describe('--list', () => {
  const roster = [inert('a'), inert('b', { tier: 'heavy' }), inert('c')];

  it('prints every check as id<TAB>title, in registry order, and exits 0', async () => {
    const s = setup(roster);
    expect(await s.run({ list: true })).toBe(0);
    expect(s.out()).toBe('a\ta title\nb\tb title\nc\tc title\n');
  });

  it('narrows to the named tier', async () => {
    const s = setup(roster);
    await s.run({ list: true, tier: 'heavy' });
    expect(s.out()).toBe('b\tb title\n');
  });

  it('lists named ids in the order they were given, which is the order they would run', async () => {
    const s = setup(roster);
    await s.run({ list: true, ids: ['c', 'a'] });
    expect(s.out()).toBe('c\tc title\na\ta title\n');
  });

  it('refuses an id that names no check, as a run does, instead of listing nothing with exit 0', async () => {
    // `--list --id typo` printed an empty list and exited 0: the same answer as a real
    // selection that happened to be empty, and the opposite of what `check --id typo` says.
    const s = setup(roster);

    expect(await s.run({ list: true, ids: ['a', 'typo'] })).toBe(2);
    expect(s.err()).toContain('unknown check id(s): typo');
    expect(s.out()).toBe('');
  });

  it('prints the roster as JSON under --json — it printed the tab-separated list', async () => {
    const s = setup([inert('a'), inert('b', { tier: 'heavy', advisory: true, exclusive: true })]);
    expect(await s.run({ list: true, json: true })).toBe(0);
    expect(JSON.parse(s.out())).toEqual([
      { id: 'a', title: 'a title', tier: 'fast', advisory: false, exclusive: false },
      { id: 'b', title: 'b title', tier: 'heavy', advisory: true, exclusive: true },
    ]);
  });

  it('refuses an id outside the named tier, as a run does', async () => {
    const s = setup(roster);
    expect(await s.run({ list: true, tier: 'heavy', ids: ['a'] })).toBe(2);
    expect(s.err()).toBe("'a' is in tier fast, not heavy — with --tier, --id names checks of that tier\n");
  });

  it('answers an empty tier with nothing — a question, not a run', async () => {
    const s = setup(roster);
    expect(await s.run({ list: true, tier: 'nightly' })).toBe(0);
    expect(s.out()).toBe('');
  });

  it('answers before any flag validation — a query is not refused over a shard it never uses', async () => {
    const s = setup(roster);
    expect(await s.run({ list: true, shard: 'nonsense' })).toBe(0);
  });
});

describe('--relevance', () => {
  const touches = (path: string) => inert('gate', { when: (changed) => changed.includes(path) });

  it('answers "run" when the diff touches what the gate cares about', async () => {
    const s = setup([touches('db/schema.sql')], testContext({ changed: ['db/schema.sql'] }).vcs);
    expect(await s.run({ relevance: true, ids: ['gate'] })).toBe(0);
    expect(s.out()).toBe('run\n');
  });

  it('answers "skip" when it does not, and still exits 0 — "skip" is an answer, not a failure', async () => {
    const s = setup([touches('db/schema.sql')], testContext({ changed: ['README.md'] }).vcs);
    expect(await s.run({ relevance: true, ids: ['gate'] })).toBe(0);
    expect(s.out()).toBe('skip\n');
  });

  it('answers "run" under --all, whatever the diff — the same rule the run itself applies', async () => {
    const s = setup([touches('db/schema.sql')], testContext({ changed: ['README.md'] }).vcs);
    await s.run({ relevance: true, ids: ['gate'], all: true });
    expect(s.out()).toBe('run\n');
  });

  it('answers "run" under SPECWARDEN_ALL=1 too', async () => {
    const s = setup([touches('db/schema.sql')], testContext({ changed: ['README.md'] }).vcs);
    await s.run({ relevance: true, ids: ['gate'] }, { SPECWARDEN_ALL: '1' });
    expect(s.out()).toBe('run\n');
  });

  it('answers "run" when a shared build input changed, from the config’s own list', async () => {
    const registry = new CheckRegistry();
    registry.registerAll([touches('db/schema.sql')]);
    let out = '';
    const vcs = testContext({ changed: ['pnpm-lock.yaml'] }).vcs;
    await check(
      args({ relevance: true, ids: ['gate'] }),
      { adapters: () => ({ vcs }), sharedBuildInputs: ['pnpm-lock.yaml'] },
      registry,
      '/repo',
      {},
      { out: (t) => (out += t), err: () => {} },
    );
    expect(out).toBe('run\n');
  });

  it.each([[[]], [['a', 'b']]])('refuses with 2 unless exactly one id is named (%j)', async (ids) => {
    const s = setup([inert('a'), inert('b')]);
    expect(await s.run({ relevance: true, ids })).toBe(2);
    expect(s.err()).toBe('--relevance requires exactly one --id\n');
    expect(s.out()).toBe('');
  });

  it('refuses an unknown id with 2 and names it, rather than answering "skip" for a gate that does not exist', async () => {
    // A misspelt id answered "skip" would let CI skip a gate's setup forever.
    const s = setup([inert('a')]);
    expect(await s.run({ relevance: true, ids: ['typo'] })).toBe(2);
    expect(s.err()).toBe("unknown check id 'typo'\n");
    expect(s.out()).toBe('');
  });

  it('lets a fault in the gate’s own predicate propagate rather than disguising it as a usage error', async () => {
    const s = setup([
      inert('gate', {
        when: () => {
          throw new Error('predicate exploded');
        },
      }),
    ]);
    await expect(s.run({ relevance: true, ids: ['gate'] })).rejects.toThrow('predicate exploded');
  });
});

describe('a run the line selects nothing for', () => {
  const roster = [inert('a'), inert('b', { tier: 'heavy' })];

  // Both used to exit 0: "0 gate(s) passed", and a fast check run by a job named heavy.
  it('refuses a tier that holds no check, exit 2, before anything runs', async () => {
    const s = setup(roster);
    expect(await s.run({ all: true, tier: 'nightly' })).toBe(2);
    expect(s.err()).toBe("tier 'nightly' holds no check — a run over it would pass having run nothing\n");
    expect(s.out()).toBe('');
  });

  it('refuses --id outside --tier, exit 2, before anything runs', async () => {
    const s = setup(roster);
    expect(await s.run({ all: true, tier: 'heavy', ids: ['a'] })).toBe(2);
    expect(s.err()).toContain("'a' is in tier fast, not heavy");
  });
});
