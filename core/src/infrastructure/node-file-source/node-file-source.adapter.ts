import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';

import { FileNotFoundError, type IFileSource } from '../../domain';
import { platformGlobOptions } from '../_shared/glob-pattern/glob-pattern.util';
import { walkGlob, type GlobEntry, type GlobTree } from '../_shared/glob-walk/glob-walk.util';

/**
 * The real file system, behind the port. Its counterpart `InMemoryFileSource`
 * must answer every one of these methods identically — the shared contract test
 * proves it — because the in-memory source is how the engine is exercised against
 * a differently-shaped repository without standing one up.
 *
 * Canonical spelling is repository-relative with forward slashes. That is the one
 * place platform knowledge lives: a check passes `docs/x.md` on every OS and never
 * learns about `\` or a drive letter.
 */
export class NodeFileSource implements IFileSource {
  private readonly rootDir: string;

  constructor(root: string) {
    this.rootDir = resolve(root);
  }

  root(): string {
    return this.forward(this.rootDir);
  }

  normalize(path: string): string {
    return this.toRelative(this.toAbsolute(path));
  }

  exists(path: string): boolean {
    return existsSync(this.toAbsolute(path));
  }

  isDirectory(path: string): boolean {
    const abs = this.toAbsolute(path);
    return existsSync(abs) && statSync(abs).isDirectory();
  }

  read(path: string): string {
    const abs = this.toAbsolute(path);
    if (!existsSync(abs) || statSync(abs).isDirectory()) throw new FileNotFoundError(this.normalize(path));
    return readFileSync(abs, 'utf8');
  }

  tryRead(path: string): string | undefined {
    try {
      return this.read(path);
    } catch {
      return undefined;
    }
  }

  list(dir: string): readonly string[] {
    const abs = this.toAbsolute(dir);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) throw new FileNotFoundError(this.normalize(dir));
    return readdirSync(abs).sort();
  }

  glob(pattern: string): readonly string[] {
    // The walk is the engine's own, not `fs.globSync`: that exists only from Node 22,
    // and answers differently across minors (24.9 found no `**\/.github/**` file that
    // 24.21 finds). The walk matches DIRECTORIES too — but a check globs to then read,
    // and reading a directory throws. So glob returns FILES only (the in-memory source
    // already does), the contract both must keep. Forward slashes and a stable order
    // make the result identical across platforms.
    return walkGlob(pattern, this.tree, platformGlobOptions(process.platform))
      .filter((m) => {
        try {
          return statSync(resolve(this.rootDir, m)).isFile();
        } catch {
          return false;
        }
      })
      .map((m) => m.split(sep).join('/'))
      .sort();
  }

  /**
   * The disk as a glob walks it: `lstat` and a directory listing, never following a link.
   * An entry that cannot be looked at is an entry that is not there — not only one that
   * is missing: a file inside a directory nobody may read threw `EACCES` here while Node's
   * own glob skipped it, and a glob that throws turns a verdict into a crash.
   */
  private readonly tree: GlobTree = {
    stat: (path) => {
      try {
        const stat = lstatSync(resolve(this.rootDir, path));
        return { directory: stat.isDirectory(), symlink: stat.isSymbolicLink() };
      } catch {
        return undefined;
      }
    },
    list: (path) => {
      try {
        return readdirSync(resolve(this.rootDir, path), { withFileTypes: true }).map((d): GlobEntry => ({
          name: d.name,
          directory: d.isDirectory(),
          symlink: d.isSymbolicLink(),
        }));
      } catch {
        return [];
      }
    },
  };

  private toAbsolute(path: string): string {
    return isAbsolute(path) ? path : resolve(this.rootDir, path);
  }

  private forward(abs: string): string {
    return abs.split(sep).join('/');
  }

  private toRelative(abs: string): string {
    const root = this.rootDir.endsWith(sep) ? this.rootDir : this.rootDir + sep;
    const rel = abs.startsWith(root) ? abs.slice(root.length) : abs;
    return this.forward(rel);
  }
}
