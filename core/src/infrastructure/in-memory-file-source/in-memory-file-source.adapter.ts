import { posix } from 'node:path';

import { FileNotFoundError, type IFileSource } from '../../domain';
import { walkGlob, type GlobEntry, type GlobTree } from '../_shared/glob-walk/glob-walk.util';

/**
 * A file source backed by a map, not a disk. It is NOT a second-class test helper:
 * it is the only way to run the engine against a repository of a DIFFERENT shape —
 * no workspaces, a flat layout, other paths — without checking out a second one,
 * and it carries the obligation to answer every `IFileSource` method exactly as
 * `NodeFileSource` does. The shared contract test is what keeps the two from
 * drifting; a divergence would mean every test written against this one measures a
 * fiction.
 *
 * Keys are canonical: repository-relative, forward slashes, no leading `./`, no
 * trailing slash. Ancestor directories of every file exist implicitly.
 */
export class InMemoryFileSource implements IFileSource {
  private readonly files = new Map<string, string>();
  private readonly dirs = new Set<string>();
  private readonly rootDir: string;

  constructor(entries: Readonly<Record<string, string>> = {}, root = '/mem') {
    this.rootDir = root.replace(/\\/g, '/');
    for (const [path, content] of Object.entries(entries)) this.put(path, content);
  }

  root(): string {
    return this.rootDir;
  }

  normalize(path: string): string {
    return this.norm(path);
  }

  exists(path: string): boolean {
    const n = this.norm(path);
    return this.files.has(n) || this.dirs.has(n);
  }

  isDirectory(path: string): boolean {
    return this.dirs.has(this.norm(path));
  }

  read(path: string): string {
    const n = this.norm(path);
    if (!this.files.has(n)) throw new FileNotFoundError(n);
    return this.files.get(n) as string;
  }

  tryRead(path: string): string | undefined {
    try {
      return this.read(path);
    } catch {
      return undefined;
    }
  }

  list(dir: string): readonly string[] {
    const n = this.norm(dir);
    if (!this.dirs.has(n)) throw new FileNotFoundError(n);
    const prefix = n === '' ? '' : `${n}/`;
    const children = new Set<string>();
    for (const key of [...this.files.keys(), ...this.dirs]) {
      if (key === n || !key.startsWith(prefix)) continue;
      const first = key.slice(prefix.length).split('/')[0];
      if (first) children.add(first);
    }
    return [...children].sort();
  }

  /**
   * The same walk `NodeFileSource` runs, over the map instead of a disk — which is what
   * makes the two agree on braces, classes, extglobs and the dot rules by construction
   * rather than by a second implementation kept in step. It used to be a regex of its
   * own that read `{ts,tsx}` and `[abc]` as text, so a check tested through `runCheck`
   * over `src/**\/*.{ts,tsx}` examined nothing that its real run read.
   *
   * Two differences from the disk are declared, not accidental. Case is significant here on
   * every host — a consumer's check test must answer the same on a macOS laptop as on
   * Linux CI — where win32 and darwin ignore it in a wildcard segment. And a map holds no
   * links, so what the disk reads through one (`**\/*` one level into a pnpm dependency) the
   * map cannot hold at all.
   */
  glob(pattern: string): readonly string[] {
    // The pattern goes to the walk as written: normalising it first read `docs/*/` — the
    // directories under `docs` — as `docs/*`, and returned the files the disk does not.
    const matched = walkGlob(pattern, this.tree, { nocase: false, windows: false });
    return [...new Set(matched.map((m) => this.norm(m)))].filter((k) => this.files.has(k)).sort();
  }

  /**
   * Every directory's entries, built once. The map is fixed after construction, and a
   * listing that scanned every key per directory made `**` quadratic: 20 seconds for
   * `**\/*.md` over 30,000 files, where the regex this replaced took 57 ms.
   */
  private children: Map<string, GlobEntry[]> | undefined;

  private childrenOf(key: string): readonly GlobEntry[] {
    if (!this.children) {
      const index = new Map<string, GlobEntry[]>();
      // A key that is a file and a directory both is listed once, as the directory.
      const fileOnly = [...this.files.keys()].filter((f) => !this.dirs.has(f));
      for (const path of [...this.dirs, ...fileOnly]) {
        if (path === '') continue;
        const parent = this.parentOf(path) as string;
        const at = index.get(parent) ?? [];
        at.push({
          name: path.slice(parent === '' ? 0 : parent.length + 1),
          directory: this.dirs.has(path),
          symlink: false,
        });
        index.set(parent, at);
      }
      this.children = index;
    }
    return this.children.get(key) ?? [];
  }

  private readonly tree: GlobTree = {
    stat: (path) => {
      const key = this.key(path);
      if (this.files.has(key)) return { directory: false, symlink: false };
      return this.dirs.has(key) ? { directory: true, symlink: false } : undefined;
    },
    list: (path) => this.childrenOf(this.key(path)),
  };

  /** A walk's path as a map key: `.` is the root, and `a/../b` is `b`. */
  private key(path: string): string {
    const n = this.norm(posix.normalize(path.replace(/\\/g, '/')));
    return n === '.' ? '' : n;
  }

  private put(path: string, content: string): void {
    const n = this.norm(path);
    this.files.set(n, content);
    let dir = this.parentOf(n);
    while (dir !== undefined) {
      this.dirs.add(dir);
      dir = this.parentOf(dir);
    }
    this.dirs.add(''); // the root is always a directory
  }

  private parentOf(path: string): string | undefined {
    const i = path.lastIndexOf('/');
    if (i === -1) return path === '' ? undefined : '';
    return path.slice(0, i);
  }

  private norm(path: string): string {
    return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/').replace(/\/$/, '').replace(/^\//, '');
  }
}
