import { pathToFileURL } from 'node:url';

import type { ICheck, IFileSource } from '../../../domain';

/**
 * What a check file may export. Three spellings, one meaning, because the consumer
 * zone of this repository already used two of them and a loader that accepted one
 * would have made the first migration a rename of every file.
 */
interface ICheckModule {
  readonly check?: ICheck;
  readonly gateCheck?: ICheck;
  readonly checks?: readonly ICheck[];
  readonly default?: ICheck | readonly ICheck[];
}

export class CheckDiscoveryError extends Error {
  override readonly name = 'CheckDiscoveryError';
}

export interface IDiscoveredChecks {
  readonly checks: readonly ICheck[];
  /** The files that were read, repository-relative — so a run can say what it swept. */
  readonly files: readonly string[];
}

/**
 * Find and load every check under a directory, by convention.
 *
 * THE CONVENTION. `<dir>/**\/*.check.mjs`, each exporting `check`, `checks`, or a
 * default. Files elsewhere (`_shared/`, tests, data) are simply not checks and are
 * not read. Sorted by path, so registry order is the tree's order and two runs of
 * the same tree list the same thing.
 *
 * WHY A CONVENTION AT ALL. Before this, wiring a check meant three edits in two
 * files: import it in the config, add it to a map keyed by id, and keep that map in
 * the same order as a registry that ALSO named the check. Twenty-five checks, so
 * seventy-five lines that said nothing a folder listing did not — and one forgotten
 * import was a check that existed, had a test, and never ran. A folder is the map.
 *
 * A file that exports nothing usable is an ERROR, never a skip. A check that sits in
 * the checks folder and is silently not loaded is the exact failure this engine is
 * built against: it looks like coverage.
 */
export async function discoverChecks(files: IFileSource, dir: string): Promise<IDiscoveredChecks> {
  const paths = files.glob(`${dir}/**/*.check.mjs`);
  const checks: ICheck[] = [];
  const seen = new Map<string, string>();

  for (const rel of paths) {
    const abs = `${files.root()}/${rel}`;
    const mod = (await import(pathToFileURL(abs).href)) as ICheckModule;
    const found = exported(mod);
    if (found.length === 0) {
      throw new CheckDiscoveryError(
        `${rel} exports no check. A file under ${dir}/ named *.check.mjs must export \`check\`, \`checks\` or a default — ` +
          `rename it if it is a helper, or export the check it builds.`,
      );
    }
    for (const c of found) {
      const other = seen.get(c.id);
      if (other) {
        throw new CheckDiscoveryError(`check id '${c.id}' is exported by both ${other} and ${rel}. One id, one file.`);
      }
      seen.set(c.id, rel);
      checks.push(c);
    }
  }
  return { checks, files: paths };
}

function exported(mod: ICheckModule): readonly ICheck[] {
  const out: ICheck[] = [];
  if (isCheck(mod.check)) out.push(mod.check);
  if (isCheck(mod.gateCheck)) out.push(mod.gateCheck);
  if (Array.isArray(mod.checks)) out.push(...mod.checks.filter(isCheck));
  if (isCheck(mod.default)) out.push(mod.default);
  else if (Array.isArray(mod.default)) out.push(...mod.default.filter(isCheck));
  return out;
}

function isCheck(v: unknown): v is ICheck {
  return typeof v === 'object' && v !== null && typeof (v as ICheck).id === 'string' && typeof (v as ICheck).run === 'function';
}
