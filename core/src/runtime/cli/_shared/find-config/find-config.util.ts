import { dirname, join } from 'node:path';

import { resolveDeclaration } from '../resolve-declaration/resolve-declaration.util';

/** The consumer config file, by convention. The product knows this name the way a
 * linter knows its own rc file — it is the product's contract, not a host literal. */
export const CONFIG_DIR = '.specwarden';
export const CONFIG_FILE = 'warden.config.mjs';

/** Walk up from `cwd` to the first directory holding `.specwarden/warden.config.mjs` — or
 * `.specwarden/warden/warden.config.mjs`, the folder-per-unit form `resolveDeclaration`
 * explains. Returns the config path and the repository root (the config dir's parent). */
export function findConfig(cwd: string): { configPath: string; root: string } | undefined {
  let dir = cwd;
  for (;;) {
    const configPath = resolveDeclaration(join(dir, CONFIG_DIR), CONFIG_FILE);
    if (configPath) return { configPath, root: dir };
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
