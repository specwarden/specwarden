import type { IFileSource, IFileWriter, IRule, IVcs } from '../../../domain';
import { detectRepo, type IRepoShape } from '../adopt/detect-repo/detect-repo.util';
import type { ICliIo } from '../_shared/cli-io/cli-io.model';
import { CONFIG_DIR, CONFIG_FILE } from '../_shared/find-config/find-config.util';
import { loadTemplate } from './load-template/load-template.util';
import {
  type IWrittenFile,
  availableModules,
  describeTopLevel,
  renderCheckFiles,
  renderChecksReadme,
  renderConfig,
  renderReadme,
  renderRules,
  topLevelFiles,
} from './scaffold/scaffold.util';

/** The script names a manifest declares — none when there is no manifest or it does not
 * parse. Every other reader of the manifest degrades to "unknown"; this one threw, so a
 * half-edited `package.json` made init's first words a stack trace. */
function declaredScripts(manifest: string | undefined): string[] {
  try {
    return Object.keys((JSON.parse(manifest || '{}') as { scripts?: object }).scripts ?? {});
  } catch {
    return [];
  }
}

/** The id a written check file carries: its name, before `.check.mjs`. */
const stemOf = (path: string): string | undefined => /([^/]+)\.check\.mjs(\.example)?$/.exec(path)?.[1];

/**
 * The owner of a template rule the template left empty: the file that holds its
 * reasoning. For a rule a check enforces, that check's file — renamed, for an example,
 * since the rule only goes live once the file is. For one enforced by something else (a
 * perimeter rule), the file declaring that enforcer. The README only when neither exists.
 */
function ownerOf(rule: IRule, written: readonly IWrittenFile[]): string {
  const enforcers = 'checkIds' in rule.enforcement ? rule.enforcement.checkIds : [];
  const file =
    written.find((f) => enforcers.includes(stemOf(f.path) ?? '')) ??
    written.find((f) => enforcers.some((id) => f.body.includes(`id: '${id}'`)));
  return `${CONFIG_DIR}/${file ? file.path.replace(/\.example$/, '') : 'README.md'}`;
}

/** A rule every enforcer of which is a switched-off example: it is written commented out. */
const onlyExamples = (rule: IRule, written: readonly IWrittenFile[]): boolean => {
  const enforcers = 'checkIds' in rule.enforcement ? rule.enforcement.checkIds : [];
  const examples = new Set(written.filter((f) => f.path.endsWith('.example')).map((f) => stemOf(f.path)));
  return enforcers.length > 0 && enforcers.every((id) => examples.has(id));
};

/** What `Detected:` says — each item a fact that changed what was written. */
function detected(shape: IRepoShape): string {
  const runner =
    shape.testRunner === 'vitest' || shape.testRunner === 'jest'
      ? `test runner ${shape.testRunner}`
      : shape.testScript
        ? `test script \`${shape.testScript}\``
        : undefined;
  const packages = shape.workspacePackages.length;
  return [
    shape.packageManager ?? 'unknown package manager',
    runner,
    shape.workspaces.length ? `${packages} workspace package${packages === 1 ? '' : 's'}` : undefined,
    shape.docDirs.length ? `docs in ${shape.docDirs.join(', ')}` : 'no documentation directory found',
    shape.ci ? `${shape.ci} actions${shape.workflows[0] ? ` (${shape.workflows[0]})` : ''}` : undefined,
    shape.specFramework ? `${shape.specFramework} specs` : undefined,
    shape.composeFiles[0],
    shape.proxyConfigs[0],
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * `specwarden init` — from nothing to a run that passes, in one command.
 *
 * WHY THIS EXISTS. Before it, starting meant `adopt` (which prints), then `suggest`
 * (which prints), then hand-authoring a config whose shape you had to learn from a
 * README — three steps, two of which produce nothing you can execute. The first thing
 * a newcomer met was a blank file, and a blank file is where most adoptions of a tool
 * like this quietly end.
 *
 * WHAT IT WRITES IS THE TREE, because that is what the engine reads: a check is a file
 * under `checks/<family>/<id>.check.mjs`, discovered without being listed anywhere, and
 * it declares the rule it enforces. `--template <name>` takes a tuned starting set for a
 * kind of repository; without one it writes a check per installed module.
 *
 * WHAT IT DOES NOT WRITE matters as much: no ratchets, no baselines (both are DATA
 * earned by a run), and no check it cannot configure truthfully — that ships as an
 * `.example`, its rule commented out in `rules.mjs`, and the console ends with the steps
 * that switch it on. A step the tree leaves undone and nobody names is found in six
 * months, or never.
 *
 * REFUSES TO OVERWRITE. A second `init` on a configured repository is almost always a
 * mistake, and the cost of being wrong is someone's rule set.
 */
export async function init(
  files: IFileSource,
  writer: IFileWriter,
  io: ICliIo,
  templateName?: string,
  vcs?: IVcs,
): Promise<number> {
  const configPath = `${CONFIG_DIR}/${CONFIG_FILE}`;
  if (files.exists(configPath)) {
    io.err(`${configPath} already exists — init refuses to overwrite a config.\n`);
    io.err('Delete it first if that is really what you want, or edit it directly.\n');
    return 2;
  }

  const shape = detectRepo(files, vcs);
  const docs = shape.docDirs.length ? `${shape.docDirs[0]}/**/*.md` : '**/*.md';

  // Everything a template is allowed to know about this repository, assembled before
  // the template is even resolved: what it REQUIRES depends on what it would write
  // here, and what it would write here depends on this. The last three are what an
  // example's paths come from — the workflow CI runs, the proxy config, the env sample.
  const context = {
    docs,
    tier: 'fast',
    workspaces: shape.workspaces,
    packageManager: shape.packageManager,
    testRunner: shape.testRunner,
    // What the manifest actually declares, so a template wrapping `run lint` can tell
    // whether there is a `lint` to run.
    scripts: declaredScripts(files.tryRead('package.json')),
    ci: shape.ci,
    specFramework: shape.specFramework,
    composeFiles: shape.composeFiles,
    hasShellScripts: shape.hasShellScripts,
    workflows: shape.workflows,
    proxyConfigs: shape.proxyConfigs,
    envSamples: shape.envSamples,
  };

  // A template is resolved BEFORE anything is written, so a name nobody installed
  // leaves the repository untouched rather than half-scaffolded.
  let written: readonly IWrittenFile[];
  let templateRules: readonly IRule[] = [];
  let templateLabel = '';
  let templateConfig: { imports?: string; fields: string } = { fields: '' };
  // Only what this repository can actually resolve. Generating an import for a module
  // it has not installed produces a tree that fails on its first run.
  const modules = templateName === undefined ? availableModules(files) : [];
  if (templateName !== undefined) {
    const { template, problem } = await loadTemplate(templateName, files, context);
    if (problem) {
      io.err(`${problem}\n`);
      return 2;
    }
    written = template!.files(context);
    templateRules = template!.rules(context);
    templateLabel = template!.name;
    // A template whose tree needs the config to know something about it contributes
    // those fields as source.
    templateConfig = template!.configExtras?.(context) ?? { fields: '' };
  } else {
    written = renderCheckFiles(shape, modules);
  }

  // A template leaves `owner` empty: it does not know where this repository keeps the
  // reasoning. Filled with the file that holds it, so the owner resolves on day one.
  const owned = templateRules.map((r) => (r.owner === '' ? { ...r, owner: ownerOf(r, written) } : r));
  const live = owned.filter((r) => !onlyExamples(r, written));
  const switchedOff = owned.filter((r) => onlyExamples(r, written));

  writer.write(configPath, renderConfig(templateConfig));
  writer.write(`${CONFIG_DIR}/rules.mjs`, renderRules(live, switchedOff));
  writer.write(`${CONFIG_DIR}/README.md`, renderReadme(written));
  writer.write(`${CONFIG_DIR}/checks/README.md`, renderChecksReadme(written, shape));
  for (const f of written) writer.write(`${CONFIG_DIR}/${f.path}`, f.body);

  const checkFiles = written.filter((f) => f.path.startsWith('checks/'));
  const width = Math.max(...topLevelFiles(written).map((f) => f.length), 'checks/'.length) + 3;
  io.out(`specwarden init — wrote ${CONFIG_DIR}/\n\n`);
  for (const f of topLevelFiles(written)) io.out(`  ${f.padEnd(width)}${describeTopLevel(f)}\n`);
  io.out(`  ${'checks/'.padEnd(width)}one file per check, by family — the engine discovers them\n`);
  for (const f of checkFiles) io.out(`    ${f.path.slice('checks/'.length)}\n`);
  io.out('\n');

  if (templateLabel) io.out(`Template: ${templateLabel}\n`);
  else {
    io.out(
      modules.length
        ? `Wired: ${modules.map((m) => m.pkg).join(', ')}\n`
        : 'No optional module installed — the checks README shows what to install, and the file each one needs.\n',
    );
  }
  io.out(`Detected: ${detected(shape)}\n\n`);

  // A file ending `.example` is a check the template could not configure truthfully —
  // it needs a fact only this repository has. Named here so it is a decision, not a
  // file somebody finds in six months.
  const examples = checkFiles.filter((f) => f.path.endsWith('.example'));
  if (examples.length > 0) {
    io.out('Switched OFF until you fill them in (each says what it needs, and why):\n');
    for (const f of examples) io.out(`  ${f.path}\n`);
    io.out('\n');
  }

  io.out('Next:\n');
  io.out('  specwarden check --all      run it — this should pass on a clean tree\n');
  if (written.some((f) => f.path === 'perimeter.mjs')) {
    io.out(`  wire the perimeter — until a hook runs it, ${CONFIG_DIR}/perimeter.mjs enforces nothing.\n`);
    io.out('    Claude Code: in .claude/settings.json, a hooks.PreToolUse command running\n');
    io.out('    node "$CLAUDE_PROJECT_DIR/node_modules/specwarden/bin/warden.mjs" perimeter\n');
  }
  if (examples.length > 0) {
    io.out('  switch an example on — fill it in, rename it to .check.mjs, AND uncomment its rule\n');
    io.out(`    in ${CONFIG_DIR}/rules.mjs, so the rule is stated here, owned by the check file:\n`);
    for (const f of examples) io.out(`    ${f.path} → rule '${stemOf(f.path)}'\n`);
  }
  if (!templateLabel) {
    io.out('  specwarden suggest          conventions this repository already follows, measured\n');
  }
  io.out('  specwarden doctor           what is declared, without running any of it\n');
  return 0;
}
