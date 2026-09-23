import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { pathToFileURL } from 'node:url';

import { TIERS } from '../../../domain';
import type { IVcs } from '../../../domain';
import { ChildProcessRunner, GitVcs, NodeFileSource, NodeFileWriter } from '../../../infrastructure';
import { CONFIG_VERSION } from '../../../contracts/version/version.constant';
import {
  CheckContractVersionError,
  CheckRegistry,
  DuplicateCheckError,
  UnknownTierError,
  UnnamedCheckError,
} from '../../container';
import { PluginContractError } from '../../plugin-loader';
import { CheckDiscoveryError, loadConsumerTree } from '../../consumer-tree';
import { describeError } from '../../consumer-tree/discover-checks/discover-checks.util';
import type { IWardenConfig } from '../../config/config.model';
import { adopt } from '../adopt/adopt.command';
import { check } from '../check/check.command';
import { doctor } from '../doctor/doctor.command';
import { init } from '../init/init.command';
import { newCheck } from '../new-check/new-check.command';
import { perimeter } from '../perimeter/perimeter.command';
import { planStatus } from '../plan/plan.command';
import { suggest } from '../suggest/suggest.command';
import { syncInvariants } from '../sync-invariants/sync-invariants.command';
import { type ICliIo, defaultIo } from '../_shared/cli-io/cli-io.model';
import { CONFIG_DIR, CONFIG_FILE, findConfig } from '../_shared/find-config/find-config.util';
import { parseArgs } from '../_shared/parse-args/parse-args.util';
import { didYouMean } from '../../_shared/did-you-mean/did-you-mean.util';

const COMMANDS_NEEDING_CONFIG = ['check', 'doctor', 'migrate', 'sync-invariants'];
const COMMANDS = ['adopt', 'suggest', 'init', 'new', 'perimeter', 'plan', ...COMMANDS_NEEDING_CONFIG];

/**
 * Version control for a command that reads a repository before it has a config — or none,
 * outside a git work tree. Outside one, `ls-files` answers nothing, and `adopt`, `suggest`
 * and `init` described an empty repository over a directory full of files; without a VCS
 * they read the disk instead, leaving installed and built trees out.
 */
function vcsAt(cwd: string): IVcs | undefined {
  const proc = new ChildProcessRunner();
  const inside = proc.run('git', ['rev-parse', '--is-inside-work-tree'], { cwd });
  return inside.status === 0 && inside.stdout.trim() === 'true' ? new GitVcs(proc, cwd) : undefined;
}

/** The oldest config version there has ever been. Anything below it was never a version. */
const FIRST_CONFIG_VERSION = 1;

/** Errors that mean "this roster cannot be assembled" — a load error, exit 2, never a
 * stack: the run did not start, so no gate failed. */
const LOAD_ERRORS = [
  PluginContractError,
  CheckDiscoveryError,
  CheckContractVersionError,
  DuplicateCheckError,
  UnknownTierError,
  UnnamedCheckError,
];

export const USAGE =
  'usage: specwarden <command>\n\n' +
  '  starting out\n' +
  '    adopt                            report what this repository already is\n' +
  '    suggest                          propose rules it already follows, armed at reality\n' +
  '    init   [--template <name>]       write the starting tree\n\n' +
  '  every day\n' +
  '    check  [--tier <name>] [--id <id>] [--base <ref>] [--shard i/N] [--jobs N]\n' +
  '           [--all] [--if-relevant] [--relevance] [--list] [--fix] [--tighten]\n' +
  '           [--reporter tty|json|github] [--json] [--show-skipped]\n' +
  '    new    <check-id> [--family <folder>]   scaffold a check and its test\n' +
  '    doctor [--json]                  the roster, capabilities, ownership, rule coverage\n\n' +
  '  occasionally\n' +
  '    plan   status <file> [--verify]  the phases, and each acceptance run with --verify\n' +
  '    plan   archive <file>            refuse until the harvest is declared and resolves\n' +
  '    sync-invariants                  reconcile requirements against deposited invariants\n' +
  '    migrate                          move the config to this engine’s version\n' +
  '    perimeter                        evaluate one action on stdin (agent hook entry)\n\n' +
  '  exit\n' +
  '    0 every gate held, or the question was answered   1 a gate failed\n' +
  '    2 the line, the config or a check file could not be used\n\n' +
  '  environment\n' +
  '    CI, GITHUB_ACTIONS   a CI run: no base means a full run, SPECWARDEN_SKIP is ignored;\n' +
  '                         under GITHUB_ACTIONS the reporter defaults to github\n' +
  '    SPECWARDEN_BASE      the ref a change is measured from, as --base\n' +
  '    SPECWARDEN_ALL=1     ignore relevance, as --all\n' +
  '    SPECWARDEN_SKIP      ids to skip, comma-separated, or `all` — honoured locally only\n' +
  '    SPECWARDEN_SHELL     the shell a command check and a plan acceptance run under\n';

/**
 * The dispatcher, and nothing else.
 *
 * Every command below is reached the same way: parse argv, decide, hand over. The
 * order is not alphabetical but a gradient of how much the command needs to exist —
 * `adopt`, `suggest` and `perimeter` run on a raw repository with no config at all
 * (they are what a repository runs BEFORE it has one), then the config is found and
 * version-checked, then the registry is built, and only what survives all of that
 * reaches `check`.
 *
 * Keeping the dispatch here and the work in the command folders is what stops this
 * file growing back: a new command is a new folder plus one line, never a new branch
 * in a function that already does six things.
 *
 * EXIT CODES. 0 every gate held (or the question was answered); 1 a gate failed; 2 the
 * line, the config or the roster could not be used — a usage error or a load error.
 * Nothing is reported as 1 that is not a gate's verdict, which is why a config that does
 * not parse and a check file that throws are caught here rather than left to crash.
 */
export async function main(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
  io: ICliIo = defaultIo,
): Promise<number> {
  const args = parseArgs(argv);

  // Asking for help is not an error: the usage goes to stdout, where `| less` finds it.
  if (args.help) {
    io.out(USAGE);
    return 0;
  }
  // `plan` reads its own flags (`--verify`); every other command refuses a line the
  // grammar does not know, by name, before anything runs.
  if (args.command !== 'plan' && args.problems.length > 0) {
    io.err(`${args.problems.join('; ')}.\n\n${USAGE}`);
    return 2;
  }

  // init writes; adopt and suggest only read. All three run on a repository that has
  // no config yet, which is why they are reached before one is looked for.
  // The VCS port goes with it: what a template writes depends on what the CHECKS will
  // see, and a check reads tracked files rather than the filesystem.
  if (args.command === 'init')
    return init(new NodeFileSource(cwd), new NodeFileWriter(cwd), io, args.template, vcsAt(cwd));
  if (args.command === 'adopt') return adopt(new NodeFileSource(cwd), io, vcsAt(cwd));
  if (args.command === 'suggest') return suggest(new NodeFileSource(cwd), io, vcsAt(cwd));
  // Scaffolding a check needs a consumer directory, not a loaded config: the point is
  // to work on the repository that is still assembling one.
  if (args.command === 'new') {
    const found = findConfig(cwd);
    // Refused before a config exists: it wrote a check under a `.specwarden/` that `check`
    // then refused as having no config — a file run by nothing, with no word of why.
    // An id is asked for first — a missing one is the usage, not a missing config.
    if (!found && args.positionals[0] !== undefined) {
      io.err(
        `no ${CONFIG_DIR}/${CONFIG_FILE} found from ${cwd} upward — run \`specwarden init\` first; ` +
          'a check written now would be run by nothing.\n',
      );
      return 2;
    }
    const at = found?.root ?? cwd;
    return newCheck(new NodeFileSource(at), new NodeFileWriter(at), io, args.positionals[0], {
      consumerDir: CONFIG_DIR,
      family: args.family,
    });
  }
  // The PreToolUse entry: read the payload off stdin, block (2) or allow (0).
  if (args.command === 'perimeter') return perimeter(cwd, () => readFileSync(0, 'utf8'), io);
  if (args.command === 'plan') return planStatus(argv, cwd, io);

  if (args.command === undefined || !COMMANDS.includes(args.command)) {
    // The command that was not understood, named: the reader should not have to diff
    // what they typed against the list below.
    const named =
      args.command === undefined ? '' : `unknown command "${args.command}"${didYouMean(args.command, COMMANDS)}\n\n`;
    io.err(`${named}${USAGE}`);
    return 2;
  }
  const found = findConfig(cwd);
  if (!found) {
    io.err(`no ${CONFIG_DIR}/${CONFIG_FILE} found from ${cwd} upward — nothing to run.\n`);
    return 2;
  }
  const configName = relative(found.root, found.configPath).replace(/\\/g, '/');

  // A config that does not parse, or imports a package that is not installed, is a load
  // error — exit 2 with the file named. It crashed with a node stack and exit 1, the code
  // a red gate uses, so a CI reading the exit could not tell a broken config from a
  // failed check.
  let loaded: { default?: IWardenConfig };
  try {
    loaded = (await import(pathToFileURL(found.configPath).href)) as { default?: IWardenConfig };
  } catch (err) {
    io.err(`${configName} failed to load: ${describeError(err)}\n`);
    return 2;
  }
  const config = loaded.default;
  if (!config || typeof config !== 'object') {
    io.err(
      `${found.configPath} must default-export a config object (see defineConfig). Checks are read from checks/ by convention.\n`,
    );
    return 2;
  }

  // Validated HERE rather than before the config loads: which tiers are legal is a
  // repository's declaration, so the check cannot happen until its config is in hand.
  // Still validated, and still by name — a typo'd `--tier prr` must be refused rather
  // than silently selecting no checks and reporting a green run over an empty set.
  const tiers: readonly string[] = config.tiers ?? TIERS;
  if (args.tier && !tiers.includes(args.tier)) {
    io.err(`unknown tier "${args.tier}" — expected one of: ${tiers.join(', ')}\n`);
    return 2;
  }

  const configVersion = config.version ?? CONFIG_VERSION;
  if (args.command === 'migrate') {
    if (configVersion === CONFIG_VERSION) {
      io.out(`config is at version ${configVersion}, the current version — nothing to migrate.\n`);
      return 0;
    }
    if (configVersion > CONFIG_VERSION) {
      io.err(
        `config declares version ${configVersion}, newer than this engine (v${CONFIG_VERSION}). Upgrade specwarden.\n`,
      );
      return 2;
    }
    // A version below the first one was never a version, so there is nothing to migrate
    // FROM — and a zero exit over a migration that did not happen reads as done.
    if (configVersion < FIRST_CONFIG_VERSION) {
      io.err(
        `config declares version ${configVersion}, which no engine ever spoke — the first config version is ` +
          `${FIRST_CONFIG_VERSION}. Set \`version: ${CONFIG_VERSION}\`, or remove the key.\n`,
      );
      return 2;
    }
    io.out(`config is at version ${configVersion}; no migration to v${CONFIG_VERSION} is defined yet.\n`);
    return 0;
  }
  if (configVersion > CONFIG_VERSION) {
    io.err(
      `${found.configPath} declares config version ${configVersion}, but this engine speaks v${CONFIG_VERSION}. ` +
        `Upgrade specwarden, or pin the config to v${CONFIG_VERSION}.\n`,
    );
    return 2;
  }

  // The interop seam: read requirements from the configured spec source and reconcile
  // them with the invariants already in the corpus. Prepares and prints; writes
  // nothing. Placed AFTER the version guard so a config newer than this engine is
  // refused here on the same terms as check/doctor/list, not silently operated on.
  if (args.command === 'sync-invariants') {
    return syncInvariants(config, new NodeFileSource(found.root), io, new GitVcs(new ChildProcessRunner(), found.root));
  }

  // The roster comes from the TREE, by convention: checks discovered under
  // `<consumer>/checks/`, then the config's own, then plugins, then the harness's
  // self-checks assembled from defaults. The config names only what the tree cannot.
  // The ASSEMBLED register, not `config.rules`: a rule may be declared on the check
  // that enforces it, and the audits read the assembled set. `doctor` read the config's
  // list directly and reported the three checks carrying their own rule as orphans —
  // a diagnostic saying the harness was broken in exactly the way it was not.
  let rules = config.rules;
  let registry: CheckRegistry;
  try {
    const tree = await loadConsumerTree(new NodeFileSource(found.root), CONFIG_DIR, config);
    // A tier is held to the vocabulary HERE, where the vocabulary is known: a factory
    // cannot know a repository's custom tiers.
    registry = new CheckRegistry({ tiers, originOf: (c) => tree.origins.get(c) });
    registry.registerAll(tree.checks);
    rules = tree.rulesDeclared ? tree.rules : undefined;
    // What the loader decided answers a question ABOUT the roster — `doctor`, `check
    // --list` — and is not news on every run: two `ℹ` lines on each hook and each CI
    // step, green or red, taught everyone to read past stderr, where a load error goes.
    const aboutTheRoster = args.command === 'doctor' || args.list;
    if (aboutTheRoster && !args.json) for (const note of tree.notes) io.err(`ℹ ${note}\n`);
  } catch (err) {
    if (LOAD_ERRORS.some((kind) => err instanceof kind)) {
      io.err(`${(err as Error).message}\n`);
      return 2;
    }
    throw err;
  }

  if (args.command === 'doctor') return doctor({ ...config, rules }, registry, io, { json: args.json });
  return check(args, config, registry, found.root, env, io);
}
