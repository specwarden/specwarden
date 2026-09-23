import type { IFileSource, IVcs } from '../../../domain';
import { detectRepo } from './detect-repo/detect-repo.util';
import type { ICliIo } from '../_shared/cli-io/cli-io.model';

const listOr = (items: readonly string[], none: string): string => (items.length ? items.join(', ') : none);

/**
 * `specwarden adopt` — the day-one lever. `init` on an empty config is useless: the
 * built-ins look for documents a new repository does not have yet. adopt comes from
 * the other side — it reads what the repository already IS and reports it, so the
 * first thing a newcomer sees is a description of their own repo, not an empty
 * config. It writes nothing; `init` writes the tree, and `suggest` proposes checks for it.
 *
 * It reads what the checks will read — tracked files — and reports every fact `init` acts
 * on. It said nothing of the CI workflow, the documents or the compose file, all of which
 * change what `init` writes, so the report and the tree disagreed about the repository.
 */
export function adopt(files: IFileSource, io: ICliIo, vcs?: IVcs): number {
  const shape = detectRepo(files, vcs);
  const documents = (vcs ? vcs.trackedFiles('**/*.md') : files.glob('**/*.md')).filter(
    (f) => !/(^|\/)node_modules\//.test(f),
  );
  const runner =
    shape.testRunner === undefined
      ? 'unknown'
      : shape.testRunner === 'other' && shape.testScript
        ? `other — \`${shape.testScript}\``
        : shape.testRunner;
  const ci = shape.ci
    ? `${shape.ci === 'github' ? 'github actions' : 'gitlab'}${shape.workflows.length ? ` — ${shape.workflows.join(', ')}` : ''}`
    : 'none';
  const packages = shape.workspacePackages.length;

  io.out('specwarden adopt — what this repository already is:\n\n');
  io.out(`  package manager : ${shape.packageManager ?? 'unknown'}\n`);
  io.out(
    `  workspaces      : ${shape.workspaces.length ? `${shape.workspaces.join(', ')} (${packages} package${packages === 1 ? '' : 's'})` : 'none'}\n`,
  );
  io.out(`  test runner     : ${runner}\n`);
  io.out(`  ci              : ${ci}\n`);
  io.out(
    `  documents       : ${documents.length ? `${documents.length} markdown file(s)${documents.includes('README.md') ? ', README.md among them' : ''}` : 'none'}\n`,
  );
  io.out(`  doc directories : ${listOr(shape.docDirs, 'none')}\n`);
  io.out(`  agent router    : ${shape.hasAgentRouter ? 'present' : 'none'}\n`);
  io.out(`  specs           : ${shape.specFramework ?? 'none'}\n`);
  io.out(`  compose         : ${listOr(shape.composeFiles, 'none')}\n`);
  io.out(`  proxy configs   : ${listOr(shape.proxyConfigs, 'none')}\n`);
  io.out(`  shell scripts   : ${shape.hasShellScripts ? 'present' : 'none'}\n\n`);
  // Never "copy into warden.config.mjs": a check is a FILE under .specwarden/checks/, and
  // before `init` the config this pointed at did not exist.
  io.out('Next: `specwarden init` writes .specwarden/, one check per file under its checks folder.\n');
  io.out('`specwarden suggest` measures conventions this repository already follows and prints\n');
  io.out('each as a complete check file to save there. Nothing is enabled for you.\n');
  return 0;
}
