import type { IFileSource } from '../../../../domain';
import { dirOf, joinDir, stem } from '../../../../primitives/_shared';

export interface ISiblingInference {
  readonly when: string;
  readonly require: string;
  /** The pathspecs left out of `when` — carried into the suggested check as `except`. */
  readonly except: readonly string[];
  /** The files measured — `when`, without `except`. */
  readonly subjects: readonly string[];
  readonly total: number;
  readonly satisfied: number;
  /** satisfied / total, in [0, 1]; 0 when nothing matched. */
  readonly ratio: number;
  /** The files that DON'T have the sibling — always shown, never hidden, so a
   * coincidence is not mistaken for a convention. */
  readonly exceptions: readonly string[];
}

/** How the files are listed: tracked files where there is version control, as a check
 * will list them. */
export type TListFiles = (pathspec: string) => readonly string[];

export interface IInferSiblingOptions {
  /** Pathspecs left out of `when` — the tests themselves, over every source file. */
  readonly except?: readonly string[];
  /** How files are listed. Absent: the disk, without installed or built trees. */
  readonly list?: TListFiles;
}

/**
 * Measure how consistently files matching `when` have the sibling `require`
 * describes. This is what turns "author a rule" into "confirm a rule": a team's
 * existing habit, measured, becomes a `siblingRequired(...)` with its ratchet set
 * to the current exceptions — proposed, never enabled on its own.
 *
 * It measures what the CHECK will read. The disk glob it used counted `node_modules/`
 * and `dist/`, so a repository's habit was diluted by — or invented from — files it
 * never wrote, and the ratchet it proposed was one the check would never see.
 */
export function inferSibling(
  files: IFileSource,
  when: string,
  require: string,
  options: IInferSiblingOptions = {},
): ISiblingInference {
  const list = options.list ?? ((pathspec: string) => files.glob(pathspec).filter((f) => !INSTALLED_OR_BUILT.test(f)));
  const except = options.except ?? [];
  const exempt = new Set(except.flatMap((pathspec) => list(pathspec)));
  const matched = list(when).filter((file) => !exempt.has(file));
  const exceptions = matched.filter(
    (file) => !files.exists(joinDir(dirOf(file), require.replace('{name}', stem(file)))),
  );
  const satisfied = matched.length - exceptions.length;
  return {
    when,
    require,
    except,
    subjects: matched,
    total: matched.length,
    satisfied,
    ratio: matched.length === 0 ? 0 : satisfied / matched.length,
    exceptions,
  };
}

/** What a listing with no version control must not count: installed and built trees. */
const INSTALLED_OR_BUILT = /(^|\/)(node_modules|dist|build|coverage)\//;
