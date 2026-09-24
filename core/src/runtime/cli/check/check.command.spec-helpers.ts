/**
 * The fixtures the `check` command suites share — argv, a check, a wired command over
 * the testing kit's ports, and a tracer. One copy, because a fixture copied into a
 * second suite is how two suites start testing different commands while both stay green.
 */
import { CHECK_CONTRACT_VERSION, type ICheck, type IVcs } from '../../../domain';
import { testContext } from '../../../testing';
import { CheckRoster } from '../../container';
import type { ISpecwardenConfig } from '../../config/config.model';
import type { IParsedArgs } from '../_shared/parse-args/parse-args.util';
import { check } from './check.command';

export const args = (over: Partial<IParsedArgs> = {}): IParsedArgs => ({
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
  verify: false,
  flags: [],
  help: false,
  problems: [],
  ...over,
});

export const aCheck = (id: string, over: Partial<ICheck> = {}): ICheck => ({
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

export function setup(
  checks: readonly ICheck[],
  config: ISpecwardenConfig = {},
  vcs: IVcs = testContext({ changed: [] }).vcs,
) {
  const roster = new CheckRoster();
  roster.registerAll(checks);
  const t = testContext();
  const full: ISpecwardenConfig = {
    adapters: () => ({ vcs, files: t.files, clock: t.clock, proc: t.proc }),
    ...config,
  };
  let out = '';
  let err = '';
  const io = { out: (s: string) => (out += s), err: (s: string) => (err += s) };
  return {
    run: (a: Partial<IParsedArgs> = {}, env: NodeJS.ProcessEnv = {}) => check(args(a), full, roster, '/repo', env, io),
    out: () => out,
    err: () => err,
  };
}

/** A check that records that it ran, so "refused before anything ran" is observable. */
export function tracer() {
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
