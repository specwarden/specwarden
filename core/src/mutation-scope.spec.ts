import { existsSync, globSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import strykerConfig from '../stryker.config.mjs';

/**
 * The static partner for stryker's `mutate` globs.
 *
 * WHY THIS FILE EXISTS. On 2026-09-22 the mutation gate was found to have been mutating
 * NOTHING: `mutate` was `src/checks/*.ts` and `src/primitives/*.ts` — one star per level —
 * against a tree that is folder-per-unit, where every check lives at
 * `src/checks/<id>/<id>.check.ts`. The globs matched only the two barrels, which the config
 * excludes, so stryker instrumented zero files and exited with `No tests were executed`. It
 * failed loudly and said nothing true about the cause, in the one gate whose entire job is
 * proving that a check would NOTICE being broken.
 *
 * A glob is not evidence of a scope. It is a claim about the disk, and this asks the disk.
 *
 * It lives here rather than in the nightly gate on purpose: the configuration is wrong long
 * before the nightly run, and this costs milliseconds in the suite that runs on every push.
 */

/** The package root — FOUND by walking up to the config, never counted in `..`s. */
const PACKAGE_ROOT = (() => {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(dir, 'stryker.config.mjs'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('no stryker.config.mjs above this spec');
    dir = parent;
  }
})();

const posix = (p: string) => p.replaceAll('\\', '/');

const expand = (patterns: readonly string[]) =>
  new Set(patterns.flatMap((p) => globSync(p, { cwd: PACKAGE_ROOT }) as string[]).map(posix));

const mutatePatterns = strykerConfig.mutate as readonly string[];
const included = mutatePatterns.filter((p) => !p.startsWith('!'));
const excluded = mutatePatterns.filter((p) => p.startsWith('!')).map((p) => p.slice(1));

/** Exactly what stryker will instrument, resolved against the real tree. */
const scope = (() => {
  const out = expand(included);
  for (const file of expand(excluded)) out.delete(file);
  return [...out].sort();
})();

/** Every source file the config's own comment claims is in scope: the product-zone checks and
 * the primitives they are built from, minus the barrels, the shared helper and the specs. */
const claimedSubjects = (() => {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== '_shared') walk(full);
      } else if (name.endsWith('.ts') && !name.endsWith('.spec.ts') && name !== 'index.ts') {
        out.push(posix(relative(PACKAGE_ROOT, full)));
      }
    }
  };
  walk(join(PACKAGE_ROOT, 'src', 'checks'));
  walk(join(PACKAGE_ROOT, 'src', 'primitives'));
  return out.sort();
})();

describe("stryker's mutation scope", () => {
  it('matches real files at all — an empty scope mutates nothing and reports a test failure instead', () => {
    // The measured floor, and it only ever rises: thirteen files when this was written, which is
    // every product-zone check and primitive. A bare `not.toHaveLength(0)` would have passed on a
    // single accidental match, which is the state that looks like a working configuration.
    expect(scope.length).toBeGreaterThanOrEqual(13);
  });

  it('covers every product-zone check and primitive, so the config comment is true of the disk', () => {
    // The stronger half. The scope being non-empty says a glob matched something; this says it
    // matched the subject the config claims. A new check in its own folder joins automatically —
    // and if a future layout puts it somewhere the glob cannot reach, this fails by NAME.
    expect(scope).toEqual(claimedSubjects);
  });

  it('mutates no spec file — a mutated test deflates the score without measuring anything', () => {
    // Measured while diagnosing the empty glob: dropping the `!src/**/*.spec.ts` exclusion took
    // the score from 75.42% to 61.47%, all of the difference being mutants inside test bodies.
    expect(scope.filter((f) => f.endsWith('.spec.ts'))).toEqual([]);
  });

  it('declares a break threshold, so a drop in the score fails rather than being reported', () => {
    // `thresholds.break = null` is stryker's documented way to silence the failure, and it is the
    // one edit that would turn this gate into a report nobody reads.
    expect(typeof (strykerConfig.thresholds as { break?: unknown }).break).toBe('number');
  });
});
