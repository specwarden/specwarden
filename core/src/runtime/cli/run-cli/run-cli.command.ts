import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { TIERS } from '../../../domain';
import { ChildProcessRunner, GitVcs, NodeFileSource, NodeFileWriter } from '../../../infrastructure';
import { CONFIG_VERSION } from '../../../contracts/version/version.constant';
import { CheckRegistry } from '../../container';
import { PluginContractError } from '../../plugin-loader';
import { CheckDiscoveryError, loadConsumerTree } from '../../consumer-tree';
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

const COMMANDS_NEEDING_CONFIG = ['check', 'doctor', 'migrate', 'sync-invariants'];

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
 */
export async function main(argv: readonly string[], env: NodeJS.ProcessEnv, cwd: string, io: ICliIo = defaultIo): Promise<number> {
  const args = parseArgs(argv);

  // init writes; adopt and suggest only read. All three run on a repository that has
  // no config yet, which is why they are reached before one is looked for.
  // The VCS port goes with it: what a template writes depends on what the CHECKS will
  // see, and a check reads tracked files rather than the filesystem.
  if (args.command === 'init')
    return init(new NodeFileSource(cwd), new NodeFileWriter(cwd), io, args.template, new GitVcs(new ChildProcessRunner(), cwd));
  if (args.command === 'adopt') return adopt(new NodeFileSource(cwd), io);
  if (args.command === 'suggest') return suggest(new NodeFileSource(cwd), io);
  // Scaffolding a check needs a consumer directory, not a loaded config: the point is
  // to work on the repository that is still assembling one.
  if (args.command === 'new') {
    const found = findConfig(cwd);
    const at = found?.root ?? cwd;
    return newCheck(new NodeFileSource(at), new NodeFileWriter(at), io, args.positionals[0], {
      consumerDir: CONFIG_DIR,
      family: args.family,
    });
  }
  // The PreToolUse entry: read the payload off stdin, block (2) or allow (0).
  if (args.command === 'perimeter') return perimeter(cwd, () => readFileSync(0, 'utf8'), io);
  if (args.command === 'plan') return planStatus(argv, cwd, io);

  if (args.command === undefined || !COMMANDS_NEEDING_CONFIG.includes(args.command)) {
    io.err(
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
        '    doctor                           the roster, capabilities, ownership, rule coverage\n\n' +
        '  occasionally\n' +
        '    plan                             the plan lifecycle\n' +
        '    sync-invariants                  reconcile requirements against deposited invariants\n' +
        '    migrate                          move the config to this engine’s version\n' +
        '    perimeter                        evaluate one action on stdin (agent hook entry)\n',
    );
    return 2;
  }
  const found = findConfig(cwd);
  if (!found) {
    io.err(`no ${CONFIG_DIR}/${CONFIG_FILE} found from ${cwd} upward — nothing to run.\n`);
    return 2;
  }

  const loaded = (await import(pathToFileURL(found.configPath).href)) as { default?: IWardenConfig };
  const config = loaded.default;
  if (!config || typeof config !== 'object') {
    io.err(`${found.configPath} must default-export a config object (see defineConfig). Checks are read from checks/ by convention.\n`);
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
      io.err(`config declares version ${configVersion}, newer than this engine (v${CONFIG_VERSION}). Upgrade specwarden.\n`);
      return 2;
    }
    // configVersion < CONFIG_VERSION: no migrations are defined yet (only v1 exists).
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
  if (args.command === 'sync-invariants') return syncInvariants(config, new NodeFileSource(found.root), io);

  // The roster comes from the TREE, by convention: checks discovered under
  // `<consumer>/checks/`, then the config's own, then plugins, then the harness's
  // self-checks assembled from defaults. The config names only what the tree cannot.
  const registry = new CheckRegistry();
  // The ASSEMBLED register, not `config.rules`: a rule may be declared on the check
  // that enforces it, and the audits read the assembled set. `doctor` read the config's
  // list directly and reported the three checks carrying their own rule as orphans —
  // a diagnostic saying the harness was broken in exactly the way it was not.
  let rules = config.rules;
  try {
    const tree = await loadConsumerTree(new NodeFileSource(found.root), CONFIG_DIR, config);
    registry.registerAll(tree.checks);
    rules = config.rules === undefined ? undefined : tree.rules;
    if (!args.json) for (const note of tree.notes) io.err(`ℹ ${note}\n`);
  } catch (err) {
    if (err instanceof PluginContractError || err instanceof CheckDiscoveryError) {
      io.err(`${err.message}\n`);
      return 2;
    }
    throw err;
  }

  if (args.command === 'doctor') return doctor({ ...config, rules }, registry, io);
  return check(args, config, registry, found.root, env, io);
}
