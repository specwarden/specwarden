import type { IFileSource, IFileWriter, IRule, IVcs } from '../../../domain';
import { detectRepo } from '../adopt/detect-repo/detect-repo.util';
import type { ICliIo } from '../_shared/cli-io/cli-io.model';
import { CONFIG_DIR, CONFIG_FILE } from '../_shared/find-config/find-config.util';
import { loadTemplate } from './load-template/load-template.util';
import {
  availableModules,
  renderCheckFiles,
  renderChecksReadme,
  renderConfig,
  renderReadme,
  renderRules,
} from './scaffold/scaffold.util';

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
 * under `checks/<family>/<id>.check.mjs`, discovered without being listed anywhere. So
 * the newcomer's first sight is the structure they will grow, not a config they will
 * have to keep in step with a folder.
 *
 * `--template <name>` takes a tuned starting set for a kind of repository. Without one
 * it writes a check per installed module — which is the minimum that is still honest.
 *
 * WHAT IT DOES NOT WRITE matters as much: no ratchets, no baselines (both are DATA
 * earned by a run, and a ratchet nobody measured is a promise about nothing), and no
 * check it cannot configure truthfully. A check nobody chose, failing on day one,
 * teaches that the tool is noisy — and that lesson outlives the check.
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
  // here, and what it would write here depends on this.
  const context = {
    docs,
    tier: 'fast',
    workspaces: shape.workspaces,
    packageManager: shape.packageManager,
    testRunner: shape.testRunner,
    // What the manifest actually declares, so a template wrapping `run lint` can tell
    // whether there is a `lint` to run.
    scripts: Object.keys((JSON.parse(files.tryRead('package.json') || '{}') as { scripts?: object }).scripts ?? {}),
    ci: shape.ci,
    specFramework: shape.specFramework,
    composeFiles: shape.composeFiles,
    hasShellScripts: shape.hasShellScripts,
  };

  // A template is resolved BEFORE anything is written, so a name nobody installed
  // leaves the repository untouched rather than half-scaffolded.
  let templateFiles: readonly { path: string; body: string }[] = [];
  let templateRules: readonly IRule[] = [];
  let templateLabel = '';
  let templateConfig: { imports?: string; fields: string } = { fields: '' };
  if (templateName !== undefined) {
    const { template, problem } = await loadTemplate(templateName, files, context);
    if (problem) {
      io.err(`${problem}\n`);
      return 2;
    }
    templateFiles = template!.files(context);
    // A template leaves `owner` empty: it does not know where this repository's README
    // will be. Filled with the one init itself writes, so the owner resolves on day one.
    templateRules = template!.rules(context).map((r) => (r.owner === '' ? { ...r, owner: `${CONFIG_DIR}/README.md` } : r));
    templateLabel = template!.name;
    // A template whose tree needs the config to know something about it — a perimeter's
    // rule ids counting as enforcers, say — contributes those fields as source.
    templateConfig = template!.configExtras?.(context) ?? { fields: '' };
  }

  // Only what this repository can actually resolve. Generating an import for a module
  // it has not installed produces a tree that fails on its first run.
  const modules = templateName === undefined ? availableModules(files) : [];

  writer.write(configPath, renderConfig(templateConfig));
  // Each generated check arrives with the rule it enforces, so the first run has no
  // orphan and the newcomer sees the pairing rather than being told about it.
  writer.write(`${CONFIG_DIR}/rules.mjs`, renderRules(modules, templateRules));
  writer.write(`${CONFIG_DIR}/README.md`, renderReadme());
  writer.write(`${CONFIG_DIR}/checks/README.md`, renderChecksReadme(modules, templateLabel));

  const checkFiles = templateName === undefined ? renderCheckFiles(shape, modules) : templateFiles;
  for (const f of checkFiles) writer.write(`${CONFIG_DIR}/${f.path}`, f.body);

  io.out(`specwarden init — wrote ${CONFIG_DIR}/\n\n`);
  io.out(`  ${CONFIG_FILE}   the entry point; only what the tree cannot say for itself\n`);
  io.out('  rules.mjs           what this repository has decided, and who owns each decision\n');
  io.out('  README.md           what every path here is for\n');
  io.out('  checks/             one file per check, by family — the engine discovers them\n');
  for (const f of checkFiles) io.out(`    ${f.path}\n`);
  io.out('\n');

  if (templateLabel) io.out(`Template: ${templateLabel}\n`);
  else {
    io.out(
      modules.length
        ? `Wired: ${modules.map((m) => m.pkg).join(', ')}\n`
        : 'No optional module installed — the checks README lists what to add.\n',
    );
  }
  io.out('Detected: ');
  io.out(`${shape.packageManager ?? 'unknown package manager'}`);
  io.out(shape.testRunner ? `, ${shape.testRunner}` : '');
  io.out(shape.workspaces.length ? `, ${shape.workspaces.length} workspace(s)` : '');
  io.out(shape.docDirs.length ? `, docs in ${shape.docDirs.join(', ')}` : ', no documentation directory found');
  // Named because each one CHANGES what gets written: a template omits the CI-coverage
  // check where there is no workflow, and the spec checks where there are no specs.
  io.out(shape.ci ? `, ${shape.ci} actions` : '');
  io.out(shape.specFramework ? `, ${shape.specFramework} specs` : '');
  io.out(shape.composeFiles.length ? `, ${shape.composeFiles[0]}` : '');
  io.out('\n\n');

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
  io.out('  specwarden suggest          rules this repository already follows, with each\n');
  io.out('                              ratchet set to current reality\n');
  io.out('  specwarden doctor           what is declared, without running any of it\n');
  return 0;
}
