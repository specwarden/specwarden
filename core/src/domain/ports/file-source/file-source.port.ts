/**
 * The file-system port. A check reads the tree through this, never through `fs`
 * directly — which is what lets the same check run against a real checkout
 * (`NodeFileSource`) and against a constructed in-memory tree of a DIFFERENT
 * repository shape (`InMemoryFileSource`), the only way to prove the engine does
 * not assume this project's layout without standing up a second project.
 *
 * PATH NORMALIZATION LIVES HERE. The legacy guards each carried their own
 * platform hack (a Windows drive-root special-case computed inline); a port
 * puts that knowledge in one adapter, so a check speaks one canonical spelling
 * (forward slashes, relative to the source root) and never learns the platform.
 */

/** Thrown by `read`/`list` when the target does not exist or is the wrong kind.
 * A distinct type so a check can catch "missing" without string-matching. */
export class FileNotFoundError extends Error {
  override readonly name = 'FileNotFoundError';
  constructor(readonly path: string) {
    super(`no such file in the source: ${path}`);
  }
}

export interface IFileSource {
  /** The source root, in canonical form. All other paths are relative to it. */
  root(): string;

  /** Canonical spelling of a path: forward slashes, resolved against the root.
   * The one place platform knowledge is allowed to live. */
  normalize(path: string): string;

  exists(path: string): boolean;
  isDirectory(path: string): boolean;

  /** File contents as UTF-8. Throws `FileNotFoundError` if absent or a directory. */
  read(path: string): string;
  /** File contents, or `undefined` if absent — for the common "read if present". */
  tryRead(path: string): string | undefined;

  /** Immediate child names of a directory (not recursive). Throws
   * `FileNotFoundError` if the path is absent or not a directory. */
  list(dir: string): readonly string[];

  /** Repository-relative matches of a glob, forward-slashed and sorted, so the
   * order is deterministic across platforms — a reproducible manifest depends on it. */
  glob(pattern: string): readonly string[];
}
