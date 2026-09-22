import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

import type { IFileWriter } from '../../domain';

/** The real write adapter, behind the write port. Resolves repository-relative
 * paths against the root and creates parent directories, matching how a check
 * addresses files through the read port. */
export class NodeFileWriter implements IFileWriter {
  private readonly rootDir: string;

  constructor(root: string) {
    this.rootDir = resolve(root);
  }

  write(path: string, content: string): void {
    const abs = isAbsolute(path) ? path : resolve(this.rootDir, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}
