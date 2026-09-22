/**
 * Reading a position or a name out of a repository-relative path.
 *
 * Every path here is forward-slashed and repository-relative — the one canonical
 * spelling the file-source port promises, so nothing below learns about `\` or a
 * drive letter.
 */

/** The 1-indexed line a character offset falls on. */
export function lineOf(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

/** The basename of a path without its final extension — the `{name}` a template
 * fills. `a/b/foo.service.ts` → `foo.service` (only the last extension drops). */
export function stem(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot === -1 ? base : base.slice(0, dot);
}

/** The directory of a path, forward-slashed, or '' at the root. */
export function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

/** Join a directory and a relative path, forward-slashed. */
export function joinDir(dir: string, rel: string): string {
  return dir === '' ? rel : `${dir}/${rel}`;
}

/** Whether a repository-relative path is among a glob's matches, using the active
 * file source's own glob engine (so Node and in-memory agree). */
export function pathMatches(
  ctx: { files: { glob(p: string): readonly string[] } },
  glob: string,
  path: string,
): boolean {
  return ctx.files.glob(glob).includes(path);
}
