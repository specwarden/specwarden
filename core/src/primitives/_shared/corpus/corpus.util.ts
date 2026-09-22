import type { IFileSource, IVcs } from '../../../domain';

/**
 * Reading a set of documents to check, rather than one file at a time.
 *
 * WHY THIS IS IN THE ENGINE. Measured across the first consumer's check bodies: the
 * same four-line incantation appeared in eleven of them — list, read, drop the
 * unreadable, keep the pairs — and twelve bodies skipped the port entirely and
 * reached for the platform's own file API, which is the version that cannot be run
 * against a constructed tree and therefore cannot be unit-tested at all. A helper is
 * what makes the port the path of least resistance instead of the long way round.
 *
 * Nothing here knows what is being read. The caller supplies the pattern, which is
 * a fact about its own repository.
 */

/** One document, already read. `text` is never `undefined` — a path that could not
 * be read is left out rather than carried as a hole every caller must re-check. */
export interface IDocument {
  readonly file: string;
  readonly text: string;
}

/**
 * Every file matching a glob, with its contents.
 *
 * Unreadable entries are DROPPED rather than reported: a glob resolves against the
 * working tree, and a path that vanished between the listing and the read is a race,
 * not a finding. What is worth reporting is the total being zero, which is the
 * caller's decision to make and `defineCheck`'s `corpus` option makes for it.
 */
export function readAll(files: IFileSource, pattern: string): readonly IDocument[] {
  const out: IDocument[] = [];
  for (const file of files.glob(pattern)) {
    const text = files.tryRead(file);
    if (text !== undefined) out.push({ file, text });
  }
  return out;
}

/**
 * Every TRACKED file matching a pathspec, with its contents.
 *
 * The distinction from `readAll` is not cosmetic. A glob sees the working tree —
 * build output, a scratch file, a dependency directory a pattern was not careful
 * enough to exclude — while version control sees what the repository actually
 * contains. For a check whose subject is "the documents this repository ships", the
 * tracked set is the correct corpus, and a glob over the same paths quietly measures
 * whatever happens to be on the disk of the machine running it.
 */
export function readTracked(vcs: IVcs, files: IFileSource, pathspec?: string): readonly IDocument[] {
  const out: IDocument[] = [];
  for (const file of vcs.trackedFiles(pathspec)) {
    const text = files.tryRead(file);
    if (text !== undefined) out.push({ file, text });
  }
  return out;
}
