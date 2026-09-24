import type { IFileSource, IVcs } from '../../../domain';

/**
 * Reading a set of documents to check, rather than one file at a time.
 *
 * WHY THIS IS IN THE ENGINE. Without it every documentation check repeats the same
 * four-line incantation — list, read, drop the unreadable, keep the pairs — or skips the
 * port and reaches for the platform's own file API, which is the version that cannot be
 * run against a constructed tree and therefore cannot be unit-tested at all. A helper is
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

/**
 * The corpus a primitive scans: the TRACKED files its pathspec selects, less its `except`
 * pathspecs, in path order — and how many the pathspec matched before the exemptions, so
 * a refusal can say which of the two emptied it.
 *
 * Tracked, as `readTracked` reads, and for the reason it gives: a working-tree glob found
 * `node_modules/` and `dist/`, and a scratch file turned a CI-parity run red on one
 * machine. The primitives were the last readers still asking the disk.
 */
export interface ITrackedCorpus {
  readonly files: readonly string[];
  /** Matched by the pathspec, before `except` removed any. */
  readonly matched: number;
}

/** A primitive's `files`: one pathspec, or several whose matches are joined. */
export type TPathspecs = string | readonly string[];

export function trackedCorpus(vcs: IVcs, files: TPathspecs, except: readonly string[] = []): ITrackedCorpus {
  const pathspecs = typeof files === 'string' ? [files] : files;
  const matched = [...new Set(pathspecs.flatMap((p) => vcs.trackedFiles(p)))];
  const exempt = new Set(except.flatMap((g) => vcs.trackedFiles(g)));
  return { files: matched.filter((f) => !exempt.has(f)).sort(), matched: matched.length };
}

/** Why a primitive's corpus is empty, in the words the refusal prints: the pathspec
 * matched nothing, or it matched and `except` exempted every file. */
export function emptyCorpusReason(files: TPathspecs, corpus: ITrackedCorpus, purpose: string): string {
  const named = typeof files === 'string' ? `\`${files}\`` : files.map((f) => `\`${f}\``).join(', ');
  return corpus.matched > 0 && corpus.files.length === 0
    ? `${named} matched ${corpus.matched} file(s), and \`except\` exempted all of them`
    : `${named} matched nothing to ${purpose}`;
}
