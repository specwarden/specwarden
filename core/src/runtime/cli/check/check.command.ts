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
import { selectChecks } from '../../runner/check-runner/check-runner.service';
import { didYouMean } from '../../_shared/did-you-mean/did-you-mean.util';
import type { CheckRoster, IEngineAdapters } from '../../container';
import type { ISpecwardenConfig } from '../../config/config.model';
import { type ICliIo, refusal } from '../_shared/cli-io/cli-io.model';
import { OUTPUT_VERSION } from '../../../contracts/version/version.constant';
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
  if (index < 1 || index > total)
    return `--shard "${shard}" asks for part ${index} of ${total} — the index runs from 1 to ${total}`;
  return undefined;
}

/** Why a `--jobs` value cannot be used, or `undefined` when it can. `abc`, `0` and `-3`
 * all ran serially and exited 0 — a concurrency nobody asked for, in silence. */
function jobsProblem(jobs: string | undefined): string | undefined {
  if (jobs === undefined || /^[1-9]\d*$/.test(jobs)) return undefined;
  return `--jobs must be a positive whole number of checks to run at once; got "${jobs}"`;
}

/**
 * Whether this process is running under CI, where a skip is a hole.
 *
 * `CI` is set by nearly every CI service, in several spellings: `true`, `1`, `True`. Only
 * `true` counted, so under `CI=1` a `SPECWARDEN_SKIP` reached CI and a red check
 * exited 0. Anything but empty, `false` or `0` is CI now. `GITHUB_ACTIONS` is read as the
 * reporter reads it — `true` — where ANY value used to count, `false` included.
 */
export function isCi(env: NodeJS.ProcessEnv): boolean {
  const ci = (env.CI ?? '').trim().toLowerCase();
  return (ci !== '' && ci !== 'false' && ci !== '0') || env.GITHUB_ACTIONS === 'true';
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
function reporterName(args: IParsedArgs, env: NodeJS.ProcessEnv): string {
  return args.reporter ?? (args.json ? 'json' : undefined) ?? (env.GITHUB_ACTIONS === 'true' ? 'github' : 'tty');
}

function builtInReporter(args: IParsedArgs, env: NodeJS.ProcessEnv, io: ICliIo): IReporter {
  const named = reporterName(args, env);
  if (named === 'json') return new JsonReporter(io.out);
  if (named === 'github') return new GithubReporter(io.out);
  return new TtyReporter(io.out, { showSkipped: args.showSkipped, slowest: 3 });
}

/**
 * `check` — the command the whole engine exists for, plus the two questions asked
 * ABOUT a run rather than by one: `--list` (what would be selected) and
 * `--relevance` (would this one check run at all).
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
  config: ISpecwardenConfig,
  roster: CheckRoster,
  root: string,
  env: NodeJS.ProcessEnv,
  io: ICliIo,
): Promise<number> {
  // `--list` answers from the same selection a run uses — `--tier` with `--id` included —
  // and before any flag it does not use is validated: a query is not refused over a shard.
  // `--json` is honoured — one document with its `version`; it printed the tab-separated list.
  if (args.list) {
    // An id that names nothing is refused here exactly as a run refuses it. It was dropped
    // in silence, so `--list --id typo` printed nothing and exited 0 — a listing that
    // could not tell a missing check from an empty selection.
    const unknown = args.ids.filter((id) => roster.byId(id) === undefined);
    if (unknown.length > 0) {
      const ids = roster.all().map((check) => check.id);
      io.err(refusal(`unknown check id(s): ${unknown.map((id) => `${id}${didYouMean(id, ids)}`).join(', ')}`));
      return 2;
    }
    let selected: readonly ICheck[];
    try {
      selected = selectChecks(roster, { ids: args.ids, tier: args.tier });
    } catch (err) {
      if (!(err instanceof RunnerUsageError)) throw err;
      io.err(refusal(err.message));
      return 2;
    }
    if (args.json) {
      const rows = selected.map((c) => ({
        id: c.id,
        title: c.title,
        tier: c.tier,
        advisory: Boolean(c.advisory),
        exclusive: Boolean(c.exclusive),
      }));
      // One document, versioned like every other the command line prints.
      io.out(`${JSON.stringify({ version: OUTPUT_VERSION, checks: rows })}\n`);
    } else
      for (const c of selected)
        io.out(`${c.id}	${c.title}
`);
    return 0;
  }

  const shardError = shardProblem(args.shard);
  if (shardError !== undefined) {
    io.err(refusal(shardError));
    return 2;
  }
  const jobsError = jobsProblem(args.jobs);
  if (jobsError !== undefined) {
    io.err(refusal(jobsError));
    return 2;
  }
  if (args.reporter !== undefined && !REPORTERS.includes(args.reporter)) {
    io.err(refusal(`unknown reporter "${args.reporter}" — expected one of: ${REPORTERS.join(', ')}`));
    return 2;
  }

  const proc = new ChildProcessRunner(root);
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

  // A `--base` typed on the line must name a commit. An unresolvable one was read as an
  // unreadable range — the fail-safe full run, exit 0, blaming "the range" — so a typo
  // was indistinguishable from a shallow clone. The environment's base stays fail-safe:
  // it is set once for a whole job, and the value is never printed.
  if (args.base !== undefined && !adapters.vcs.refExists(args.base)) {
    io.err(
      refusal(`--base ${args.base} does not resolve to a commit here — name a branch, a tag or a commit that exists`),
    );
    return 2;
  }

  // Whether stdout belongs to a machine: a document or annotations that a stray line of
  // prose would corrupt. A consumer's own reporter is treated as one — its stdout is its own.
  const machine = config.reporter !== undefined || reporterName(args, env) !== 'tty';
  const reporter = config.reporter ? config.reporter({ json: args.json, out: io.out }) : builtInReporter(args, env, io);
  const runner = new CheckRunner(roster, adapters, reporter);

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
    jobs: args.jobs !== undefined ? Number(args.jobs) : config.jobs,
    sharedBuildInputs: config.sharedBuildInputs,
    fullRunTriggers: config.fullRunTriggers,
    denyCapabilities: config.denyCapabilities,
  };
  const runnerEnv = {
    ci: isCi(env),
    skip: env.SPECWARDEN_SKIP,
    all: env.SPECWARDEN_ALL === '1',
    base: env.SPECWARDEN_BASE,
  };

  // `--relevance` answers "would this check run?" and nothing else, so a workflow can
  // skip an expensive setup step for a check the diff cannot affect.
  if (args.relevance) {
    if (args.ids.length !== 1) {
      io.err(refusal('--relevance answers for exactly one check — name one id'));
      return 2;
    }
    try {
      io.out(`${runner.relevanceOf(args.ids[0], runnerOptions, runnerEnv)}\n`);
      return 0;
    } catch (err) {
      if (err instanceof RunnerUsageError) {
        io.err(refusal(err.message));
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
    //
    // To stdout only for the terminal. A machine reporter's stdout is a document or a
    // stream of annotations, and the line appended after `--reporter json` made the
    // output not JSON; it goes to stderr there. `--json` keeps stderr quiet, as it does
    // for every other note.
    if (outcome.fullRunReason !== undefined && !args.json) {
      const note = `\nℹ full run — no relevance filter: ${outcome.fullRunReason}\n`;
      if (machine) io.err(note);
      else io.out(note);
    }
    return outcome.exitCode;
  } catch (err) {
    if (err instanceof RunnerUsageError) {
      io.err(refusal(err.message));
      return 2;
    }
    throw err;
  }
}
