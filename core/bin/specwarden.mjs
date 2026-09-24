#!/usr/bin/env node
/**
 * The shim. It is deliberately build-free ESM, so it runs in a fresh clone before
 * anything is compiled — which is the whole danger it guards. The engine executes
 * as compiled `dist/`; if `dist` is missing or older than the source, the shim
 * FAILS LOUDLY with the exact build command rather than running stale code or, in
 * a fresh clone, running nothing while every check reports green.
 *
 * The `prepare` script builds on install so the normal path needs none of this;
 * the shim is the net for the abnormal one — an edit to `src` without a rebuild.
 *
 * Spec files are excluded from the freshness comparison: they never reach `dist`,
 * so editing a test must not make the CLI declare itself stale.
 *
 * Freshness is compared by CONTENT, not by mtime. `actions/checkout` stamps every
 * source file with the checkout time while `actions/cache` restores `dist` with the
 * older mtime it was saved at, so an mtime comparison fired "src newer than dist" on
 * every CI cache hit even though the content was byte-identical. The build stamps
 * `dist/.srchash` with a hash of the source content; the shim recomputes it and only
 * declares staleness when the two disagree — which happens exactly when `src` was
 * edited without a rebuild, and never merely because a checkout or a cache moved the
 * files.
 *
 * Content hashing the whole tree on every run is not free, so an mtime FAST PATH runs
 * first: if the stamp is at least as new as every source file, the build ran after the
 * last edit and the content cannot have changed underneath it — no hash needed. mtime
 * can only make the stamp look OLDER than it truly is (never newer), so the fast path
 * never yields a false "fresh"; a source-newer-than-stamp mtime is ambiguous and falls
 * through to the content fingerprint, which stays the authority.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { floorOf, isBelow, refusal } from '../scripts/node-floor.mjs';
import { newestSrcMtimeMs, srcFingerprint } from '../scripts/src-fingerprint.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = dirname(here);
const srcDir = join(pkg, 'src');
const distDir = join(pkg, 'dist');
const distEntry = join(distDir, 'index.js');
const hashFile = join(distDir, '.srchash');
/**
 * How to rebuild, phrased for wherever this copy is.
 *
 * DERIVED rather than written down: a fixed `pnpm --dir <path> run build` stays correct
 * exactly as long as there is one checkout. A person meeting this message in an
 * installed copy, or in the standalone repository, would be told to cd into a directory
 * that does not exist, while the thing they actually needed was one word.
 */
const BUILD_CMD = `pnpm --dir ${relative(process.cwd(), pkg).split(sep).join('/') || '.'} run build`;

function die(reason) {
  process.stderr.write(`specwarden: ${reason}\n  run: ${BUILD_CMD}\n`);
  process.exit(1);
}

/**
 * Beneath the floor the bundle may call library surface the runtime does not have, and
 * importing it then fails with a bare `does not provide an export named …` naming an
 * internal of a file the reader never opened. That is a version complaint wearing a
 * syntax error's clothes: it cost an afternoon of blaming the network, because the
 * failure surfaced only as `git push` exiting non-zero from a hook.
 *
 * The floor is READ from `engines.node` rather than repeated here — a second copy is
 * how a declaration and its enforcement drift apart — and it is checked BEFORE the
 * import, which is the only point at which a readable message is still possible.
 *
 * Exit 1, not the 2 that means "could not be used": this same file is the agent
 * perimeter's PreToolUse hook, where 2 BLOCKS the tool call. An engine that cannot start
 * must let the agent work, not lock it out of every tool.
 */
const floor = floorOf(JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).engines?.node);
if (floor && isBelow(process.versions.node, floor)) {
  process.stderr.write(refusal(floor, process.versions.node));
  process.exit(1);
}

if (!existsSync(distEntry)) die('dist is missing — the package is not built');

// No `src` beside the build means this is an installed copy (dist-only) — nothing to
// compare against, and nothing that could have been edited underneath the build.
if (existsSync(srcDir)) {
  if (!existsSync(hashFile)) die('dist is stale — build predates the fingerprint stamp');
  // Fast path: stamp newer than every source ⇒ built after the last edit ⇒ fresh, no
  // hash. Otherwise the mtime is ambiguous — confirm by content before declaring stale.
  if (
    newestSrcMtimeMs(srcDir) > statSync(hashFile).mtimeMs &&
    readFileSync(hashFile, 'utf8').trim() !== srcFingerprint(srcDir)
  ) {
    die('dist is stale — source has changed since the build');
  }
}

const { main } = await import(pathToFileURL(distEntry).href);
process.exit(await main(process.argv.slice(2), process.env, process.cwd()));
