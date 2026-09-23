import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { removeScratch, scratchTree, verdictsIn } from '../scripts/playgrounds.mjs';
import { BRANCHES, BROKEN, CAUGHT_IN_BROKEN, CLEAN, EVERY_CHECK_ID } from './repository';

/**
 * The same composition as `playground.spec.ts`, the way a consumer actually runs it: the
 * config and the checks as FILES under `.specwarden/`, discovered by the engine, loaded by
 * node from the installed packages, and run by the CLI.
 *
 * The in-process spec hands the registry objects it built itself. That skips everything a
 * consumer meets first — discovery walking `checks/`, a file that exports the wrong name,
 * an import that resolves in this workspace and not from an installed package, a plugin
 * handed to the config and never registered. None of that can fail in-process; all of it
 * can fail here.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url));

/** Every published package, resolved from THIS package's node_modules — the ones it
 * declares in its manifest, which is what a consumer who installed them would have. */
const INSTALLED = Object.keys(
  (JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8')) as { dependencies: Record<string, string> })
    .dependencies,
).map((name) => [name, join(HERE, 'node_modules', ...name.split('/'))] as const);

/** `consumer/`, as the `.specwarden/` tree of the scratch repository. */
function consumerConfig(): Record<string, string> {
  const root = join(HERE, 'consumer');
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else out[`.specwarden/${relative(root, full).split(sep).join('/')}`] = readFileSync(full, 'utf8');
    }
  };
  walk(root);
  return out;
}

function run(tree: Record<string, string>) {
  const dir = scratchTree({ ...tree, ...consumerConfig() }, { installed: INSTALLED, branches: BRANCHES });
  try {
    return verdictsIn(dir);
  } finally {
    removeScratch(dir);
  }
}

describe('the whole workspace, as files, through the CLI', () => {
  let clean: ReturnType<typeof verdictsIn>;
  let broken: ReturnType<typeof verdictsIn>;
  beforeAll(() => {
    clean = run(CLEAN);
    broken = run(BROKEN);
  });
  afterAll(() => {
    clean = undefined as never;
  });

  it('discovers exactly the checks the in-process config declares — the plugin’s included', () => {
    expect(clean.results.map((r) => r.id).sort()).toEqual([...EVERY_CHECK_ID]);
  });

  it('is green over the clean repository, every check having run', () => {
    expect(clean.results.filter((r) => !r.ok).map((r) => `${r.id}: ${r.messages.join(' / ')}`)).toEqual([]);
    expect(clean.results.filter((r) => r.skipped)).toEqual([]);
    expect(clean.status).toBe(0);
  });

  it('turns exactly one check per package red over the broken repository', () => {
    expect([...broken.failed].sort()).toEqual([...CAUGHT_IN_BROKEN]);
    expect(broken.status).toBe(1);
  });
});
