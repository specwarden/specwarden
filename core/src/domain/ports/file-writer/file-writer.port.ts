/**
 * The write port — the only way a check may change the tree, and only if it
 * declared the `write` capability. It exists apart from `IFileSource` (which is
 * read-only) precisely so that reading and writing are separate grants: the vast
 * majority of checks read, and a check that writes is exactly the one an installing
 * repository wants to know about. A non-`write` check is handed a writer that
 * throws.
 */
export interface IFileWriter {
  /** Write UTF-8 content to a repository-relative path, creating parent
   * directories as needed. */
  write(path: string, content: string): void;
}
