import { FileNotFoundError, type IFileSource } from '../../domain';

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

  glob(pattern: string): readonly string[] {
    const re = this.globToRegExp(this.norm(pattern));
    return [...this.files.keys()].filter((k) => re.test(k)).sort();
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

  /** `**` crosses slashes, `*`/`?` stay within a segment, everything else is literal.
   * The same semantics `fs.globSync` gives — INCLUDING its default exclusion of
   * dotfiles: a `*`/`**` segment does not match a path component beginning with `.`
   * unless the pattern segment spells the dot out (`.specwarden/`). Without that the
   * two sources disagreed — the in-memory source scanned `.github`/`.specwarden` under
   * a bare double-star glob while `NodeFileSource` skipped them — so a glob-driven check could
   * pass in a test and silently under-scan in production. Pinned by the file-source
   * contract spec's dotfile cases. */
  private globToRegExp(pattern: string): RegExp {
    const segs = pattern.split('/');
    let out = '';
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const last = i === segs.length - 1;
      // A middle `**` emits its own trailing slashes, so the segment after it must not
      // be preceded by another separator.
      const afterMidStarStar = i > 0 && segs[i - 1] === '**' && i - 1 !== segs.length - 1;
      if (i > 0 && !afterMidStarStar) out += '/';
      if (seg === '**') {
        // Zero+ dot-free segments in the middle (it carries the joining slash); one+
        // dot-free segments when trailing (matching the files beneath a directory).
        out += last ? '(?!\\.)[^/]+(?:/(?!\\.)[^/]+)*' : '(?:(?!\\.)[^/]+/)*';
        continue;
      }
      out += this.segToRegExp(seg);
    }
    return new RegExp(`^${out}$`);
  }

  /** One path segment (no slash) to regex source. A `(?!\.)` guard is prepended when
   * the segment starts with a wildcard, so `*`/`?`/`[` never match a leading dot —
   * `fs.globSync`'s default. */
  private segToRegExp(seg: string): string {
    let out = '';
    for (const c of seg) {
      if (c === '*') out += '[^/]*';
      else if (c === '?') out += '[^/]';
      else if ('.+^${}()|[]\\'.includes(c)) out += `\\${c}`;
      else out += c;
    }
    return (/^[*?[]/.test(seg) ? '(?!\\.)' : '') + out;
  }
}
