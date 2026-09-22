import { existsSync, globSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';

import { FileNotFoundError, type IFileSource } from '../../domain';

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
    // globSync yields paths relative to cwd, and matches DIRECTORIES too — but a
    // check globs to then read, and reading a directory throws. So glob returns
    // FILES only (the in-memory source already does), the contract both must keep.
    // Forward slashes and a stable order make the result identical across platforms.
    return globSync(pattern, { cwd: this.rootDir })
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
