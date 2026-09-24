import { dirname, join, relative } from 'node:path';

import { resolveDeclaration } from '../resolve-declaration/resolve-declaration.util';

/** The consumer config file, by convention. The product knows this name the way a
 * linter knows its own rc file — it is the product's contract, not a consumer literal. */
export const CONFIG_DIR = '.specwarden';
export const CONFIG_FILE = 'config.mjs';

/** The config's name before it was `config.mjs`. Never read: refused, naming the rename. */
export const RETIRED_CONFIG_FILE = 'warden.config.mjs';

/**
 * Thrown when a consumer directory still holds the config under its old name.
 *
 * Read as "no config", a leftover `warden.config.mjs` made every command say there was
 * nothing to run — or, beside a new `config.mjs`, sat there unread while its author went on
 * editing it. Neither is a state to run in, so it is a load error, exit 2, with the rename.
 *
 * Rejected: reading the old name as a fallback beside the new one — a fallback is a second
 * name kept forever, and the one file the engine reads must be the one the glossary names.
 */
export class RetiredConfigError extends Error {
  override readonly name = 'RetiredConfigError';
}

/** Walk up from `cwd` to the first directory holding `.specwarden/config.mjs` — or
 * `.specwarden/config/config.mjs`, the folder-per-unit form `resolveDeclaration`
 * explains. Returns the config path and the repository root (the config dir's parent).
 * Throws `RetiredConfigError` where the config's old name is found first. */
export function findConfig(cwd: string): { configPath: string; root: string } | undefined {
  let dir = cwd;
  for (;;) {
    const retired = resolveDeclaration(join(dir, CONFIG_DIR), RETIRED_CONFIG_FILE);
    if (retired) {
      const named = relative(cwd, retired).replace(/\\/g, '/');
      throw new RetiredConfigError(
        `${named} is the config's old name — rename it to ${CONFIG_DIR}/${CONFIG_FILE}, the only name the engine reads.`,
      );
    }
    const configPath = resolveDeclaration(join(dir, CONFIG_DIR), CONFIG_FILE);
    if (configPath) return { configPath, root: dir };
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
