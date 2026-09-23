import { pathToFileURL } from 'node:url';

import type { ICheck, IFileSource } from '../../../domain';
import { UNNAMED_CHECK_ID, nameFromFile } from '../../../primitives/_shared';

/**
 * What a check file may export. Three spellings, one meaning, because the consumer
 * zone of this repository already used two of them and a loader that accepted one
 * would have made the first migration a rename of every file.
 */
interface ICheckModule {
  readonly check?: unknown;
  readonly gateCheck?: unknown;
  readonly checks?: unknown;
  readonly default?: unknown;
}

export class CheckDiscoveryError extends Error {
  override readonly name = 'CheckDiscoveryError';
}

export interface IDiscoveredChecks {
  readonly checks: readonly ICheck[];
  /** The files that were read, repository-relative — so a run can say what it swept. */
  readonly files: readonly string[];
  /** The file each check came from, so a refusal after discovery can still name it. */
  readonly origins: ReadonlyMap<ICheck, string>;
}

/** The extensions a check file is written in by mistake — each one silently skipped,
 * and the check it held never ran. */
const MISNAMED = ['ts', 'js', 'cjs', 'mts', 'cts'];

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
 * WHAT THE FILE SUPPLIES. A check exported ALONE with no `id` takes the file's name —
 * `no-todo.check.mjs` is `no-todo` — and a rule with no `owner` is owned by the file
 * that declares it. A file exporting several checks names each: none of them is the
 * file.
 *
 * EVERY WAY A FILE FAILS TO BE A CHECK IS AN ERROR, never a skip — a file that exports
 * nothing usable, one that throws while it loads, one that exports an object literal
 * instead of a built check, and a check written as `.check.ts` or `.check.js`. A check
 * that sits in the checks folder and is silently not loaded is the exact failure this
 * engine is built against: it looks like coverage.
 */
export async function discoverChecks(files: IFileSource, dir: string): Promise<IDiscoveredChecks> {
  const misnamed = MISNAMED.flatMap((ext) => files.glob(`${dir}/**/*.check.${ext}`)).sort();
  if (misnamed.length > 0) {
    const [first] = misnamed;
    throw new CheckDiscoveryError(
      `${misnamed.join(', ')}: a check under ${dir}/ is a \`*.check.mjs\` file, and ${misnamed.length === 1 ? 'this one is' : 'these are'} ` +
        `not — so ${misnamed.length === 1 ? 'it was' : 'they were'} never loaded. Rename it: ${first} → ${first.replace(/\.check\.[a-z]+$/, '.check.mjs')}.`,
    );
  }

  const paths = files.glob(`${dir}/**/*.check.mjs`);
  const checks: ICheck[] = [];
  const origins = new Map<ICheck, string>();
  const seen = new Map<string, string>();

  for (const rel of paths) {
    const found = named(rel, exported(rel, await load(files, rel)));
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
      origins.set(c, rel);
      checks.push(c);
    }
  }
  return { checks, files: paths, origins };
}

/** Import one check file. A throw while it loads — a syntax error, a factory refusing
 * its options, a missing import — is reported as that file failing to load, not as a
 * raw stack from somewhere inside the engine. */
async function load(files: IFileSource, rel: string): Promise<ICheckModule> {
  try {
    return (await import(pathToFileURL(`${files.root()}/${rel}`).href)) as ICheckModule;
  } catch (error) {
    throw new CheckDiscoveryError(`${rel} failed to load: ${describeError(error)}`);
  }
}

/** An error as one sentence: its message, prefixed by its kind when the kind says
 * something (`SyntaxError`, `TypeError`) — never a stack, which points into the engine. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const plain = error.name === 'Error' || error.name === 'CheckOptionsError';
  return `${plain ? '' : `${error.name}: `}${error.message}`;
}

/** The file's name and ownership, applied where the checks left them out. */
function named(rel: string, found: readonly ICheck[]): readonly ICheck[] {
  const stem = rel.slice(rel.lastIndexOf('/') + 1).replace(/\.check\.mjs$/, '');
  const unnamed = found.filter((c) => c.id === UNNAMED_CHECK_ID).length;
  if (unnamed > 0 && found.length > 1) {
    throw new CheckDiscoveryError(
      `${rel} exports ${found.length} checks, and ${unnamed} of them ${unnamed === 1 ? 'has' : 'have'} no \`id\`. ` +
        `Only a check exported alone takes its file's name ('${stem}'); give each check here an id.`,
    );
  }
  return found.map((c) => nameFromFile(c, { id: found.length === 1 ? stem : undefined, owner: rel }));
}

function exported(rel: string, mod: ICheckModule): readonly ICheck[] {
  const candidates: unknown[] = [];
  candidates.push(mod.check, mod.gateCheck);
  if (Array.isArray(mod.checks)) candidates.push(...(mod.checks as unknown[]));
  if (Array.isArray(mod.default)) candidates.push(...(mod.default as unknown[]));
  else candidates.push(mod.default);
  // One object exported twice (`export const check = …; export default check`) is one check.
  return [...new Set(candidates)].filter(looksLikeCheck).map((c) => built(rel, c));
}

/** Something written to BE a check: an object with a body. */
function looksLikeCheck(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && typeof (v as { run?: unknown }).run === 'function';
}

/**
 * A check a factory built, or a refusal that says what to do instead.
 *
 * A hand-written object literal carries no contract version, and the registry then
 * failed on "check-contract vundefined" with a stack pointing into the engine — the one
 * failure the version exists to make legible, made illegible.
 */
function built(rel: string, v: Record<string, unknown>): ICheck {
  if (typeof v.id !== 'string' && typeof v.contractVersion === 'number') {
    throw new CheckDiscoveryError(`${rel} exports a check whose \`id\` is not a string — every check names itself.`);
  }
  if (typeof v.contractVersion !== 'number') {
    const which = typeof v.id === 'string' && v.id ? `'${v.id}'` : 'the check it exports';
    throw new CheckDiscoveryError(
      `${rel}: ${which} is a hand-written object, not a built check — it carries no contract version, so the engine ` +
        'cannot know it speaks this one. Wrap the body in `defineCheck({ … })`: the factory supplies the zone, the ' +
        'capabilities and the version a literal has to hand-write.',
    );
  }
  return v as unknown as ICheck;
}
