import type { IFileSource } from '../../../domain';
import { detectRepo } from './detect-repo/detect-repo.util';
import type { ICliIo } from '../_shared/cli-io/cli-io.model';

/**
 * `specwarden adopt` — the day-one lever. `init` on an empty config is useless: the
 * built-ins look for documents a new repository does not have yet. adopt comes from
 * the other side — it reads what the repository already IS and reports it, so the
 * first thing a newcomer sees is a description of their own repo, not an empty
 * config. It writes nothing; `init` writes the tree, and `suggest` proposes checks for it.
 */
export function adopt(files: IFileSource, io: ICliIo): number {
  const shape = detectRepo(files);
  io.out('specwarden adopt — what this repository already is:\n\n');
  io.out(`  package manager : ${shape.packageManager ?? 'unknown'}\n`);
  io.out(`  workspaces      : ${shape.workspaces.length ? shape.workspaces.join(', ') : 'none'}\n`);
  io.out(`  test runner     : ${shape.testRunner ?? 'unknown'}\n`);
  io.out(`  agent router    : ${shape.hasAgentRouter ? 'present' : 'none'}\n`);
  io.out(`  doc directories : ${shape.docDirs.length ? shape.docDirs.join(', ') : 'none'}\n\n`);
  // Never "copy into warden.config.mjs": a check is a FILE under .specwarden/checks/, and
  // before `init` the config this pointed at did not exist.
  io.out('Next: `specwarden init` writes .specwarden/, one check per file under its checks folder.\n');
  io.out('`specwarden suggest` measures conventions this repository already follows and prints\n');
  io.out('each as a complete check file to save there. Nothing is enabled for you.\n');
  return 0;
}
