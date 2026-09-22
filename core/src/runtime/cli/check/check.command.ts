import { join } from 'node:path';

import type { ICheck, IReporter } from '../../../domain';
import {
  ChildProcessRunner,
  GithubReporter,
  GitVcs,
  JsonRatchetStore,
  JsonReporter,
  NodeFileSource,
  NodeFileWriter,
  SystemClock,
  TtyReporter,
} from '../../../infrastructure';
import { CheckRunner, RunnerUsageError } from '../../runner';
import type { CheckRegistry, IEngineAdapters } from '../../container';
import type { IWardenConfig } from '../../config/config.model';
import type { ICliIo } from '../_shared/cli-io/cli-io.model';
import { CONFIG_DIR } from '../_shared/find-config/find-config.util';
import type { IParsedArgs } from '../_shared/parse-args/parse-args.util';

/** The built-ins `--reporter` may name. A consumer's own goes through `config.reporter`. */
const REPORTERS = ['tty', 'json', 'github'];

/**
 * Why a `--shard` value cannot be used, or `undefined` when it can.
 *
 * It was forwarded verbatim: whatever the caller typed was appended to a suite's
 * command line as `--shard=<it>`. A misspelling is then a suite's own confusing error
 * at best — and at worst, for a runner that shrugs at a shard it cannot parse, a shard
 * that silently runs everything (so CI does the whole suite N times and calls it
 * sharded) or nothing (so it reports green over no tests). Refusing by name here costs
 * one regex and removes both.
 */
function shardProblem(shard: string | undefined): string | undefined {
  if (shard === undefined) return undefined;
  const parsed = /^(\d+)\/(\d+)$/.exec(shard);
  if (!parsed) return `--shard must be written i/N (for example 1/3); got "${shard}"`;
  const index = Number(parsed[1]);
  const total = Number(parsed[2]);
  if (total < 1) return `--shard "${shard}" divides the work into ${total} parts`;
  if (index < 1 || index > total) return `--shard "${shard}" asks for part ${index} of ${total} — the index runs from 1 to ${total}`;
  return undefined;
}

/**
 * Which built-in renders this run.
 *
 * `--reporter` decides when given. Otherwise `--json` still selects the machine one,
 * and the ACTIONS environment selects annotations — a CI that has a way to show a
 * finding on the diff and gets a wall of terminal text instead is a CI where nobody
 * reads the findings. It is an auto-selection rather than a default because it is
 * observable from the environment and wrong nowhere else; `--reporter tty` overrides it
 * for anyone debugging a workflow by eye.
 */
function builtInReporter(args: IParsedArgs, env: NodeJS.ProcessEnv, io: ICliIo): IReporter {
  const named = args.reporter ?? (args.json ? 'json' : undefined) ?? (env.GITHUB_ACTIONS === 'true' ? 'github' : 'tty');
  if (named === 'json') return new JsonReporter(io.out);
  if (named === 'github') return new GithubReporter(io.out);
  return new TtyReporter(io.out, { showSkipped: args.showSkipped, slowest: 3 });
}

/**
 * `check` — the command the whole engine exists for, plus the two questions asked
 * ABOUT a run rather than by one: `--list` (what would be selected) and
 * `--relevance` (would this one gate run at all).
 *
 * All three share the same selection inputs, which is why they live together: split
 * apart, a change to how a tier or an id is resolved has to be made three times, and
 * the two cheap questions would start answering differently from the expensive one.
 *
 * This is where the real adapters are constructed — the single composition point at
 * which the engine stops being pure. Everything below it receives ports.
 */
export async function check(
  args: IParsedArgs,
  config: IWardenConfig,
  registry: CheckRegistry,
  root: string,
  env: NodeJS.ProcessEnv,
  io: ICliIo,
): Promise<number> {
  if (args.list) {
    const selected: readonly ICheck[] = args.ids.length
      ? args.ids.map((id) => registry.byId(id)).filter((c): c is ICheck => c !== undefined)
      : args.tier
        ? registry.forTier(args.tier)
        : registry.all();
    for (const c of selected) io.out(`${c.id}\t${c.title}\n`);
    return 0;
  }

  const shardError = shardProblem(args.shard);
  if (shardError !== undefined) {
    io.err(`${shardError}\n`);
    return 2;
  }
  if (args.reporter !== undefined && !REPORTERS.includes(args.reporter)) {
    io.err(`unknown reporter "${args.reporter}" — expected one of: ${REPORTERS.join(', ')}\n`);
    return 2;
  }

  const proc = new ChildProcessRunner();
  const defaults: IEngineAdapters = {
    files: new NodeFileSource(root),
    vcs: new GitVcs(proc, root),
    proc,
    clock: new SystemClock(),
    writer: new NodeFileWriter(root),
    ratchets: new JsonRatchetStore((id) => join(root, CONFIG_DIR, 'ratchets', `${id}.json`)),
  };
  // The consumer may replace any port. Spread over the defaults rather than
  // substituted for them, so overriding one does not oblige a caller to construct
  // the other five — the reason this is a socket and not a required field.
  const adapters: IEngineAdapters = { ...defaults, ...config.adapters?.(defaults, { root }) };
  const reporter = config.reporter
    ? config.reporter({ json: args.json, out: io.out })
    : builtInReporter(args, env, io);
  const runner = new CheckRunner(registry, adapters, reporter);

  const runnerOptions = {
    tier: args.tier,
    ids: args.ids,
    base: args.base,
    shard: args.shard,
    all: args.all,
    fix: args.fix,
    tighten: args.tighten,
    ifRelevant: args.ifRelevant,
    // The flag wins over the config, and both are ignored by a writing run.
    concurrency: args.jobs !== undefined ? Number(args.jobs) : config.concurrency,
    sharedBuildInputs: config.sharedBuildInputs,
    fullRunTriggers: config.fullRunTriggers,
    denyCapabilities: config.denyCapabilities,
  };
  const runnerEnv = {
    ci: env.CI === 'true' || Boolean(env.GITHUB_ACTIONS),
    skip: env.SPECWARDEN_SKIP,
    all: env.SPECWARDEN_ALL === '1',
    base: env.SPECWARDEN_BASE,
  };

  // `--relevance` answers "would this gate run?" and nothing else, so a workflow can
  // skip an expensive setup step for a gate the diff cannot affect.
  if (args.relevance) {
    if (args.ids.length !== 1) {
      io.err('--relevance requires exactly one --id\n');
      return 2;
    }
    try {
      io.out(`${runner.relevanceOf(args.ids[0], runnerOptions, runnerEnv)}\n`);
      return 0;
    } catch (err) {
      if (err instanceof RunnerUsageError) {
        io.err(`${err.message}\n`);
        return 2;
      }
      throw err;
    }
  }

  try {
    const outcome = await runner.run(runnerOptions, runnerEnv);
    // Say why relevance did not apply. Without this line a run that filtered nothing
    // and a run that filtered everything print the same output, and the triggers
    // behind the full run cannot be told from the tier they replaced.
    if (outcome.fullRunReason !== undefined && !args.json) io.out(`\nℹ full run — no relevance filter: ${outcome.fullRunReason}\n`);
    return outcome.exitCode;
  } catch (err) {
    if (err instanceof RunnerUsageError) {
      io.err(`${err.message}\n`);
      return 2;
    }
    throw err;
  }
}
