// A content fingerprint of the source tree, shared by the build and the bin shim.
//
// It replaces an mtime comparison that could not survive CI: `actions/checkout`
// stamps every source file with the checkout time (now), while `actions/cache`
// restores `dist` with the older mtime it was saved at — so `src newer than dist`
// fired on every cache hit even though the content was identical. A hash of the
// source CONTENT (not its timestamps) is the same whether the tree was cloned,
// checked out, or restored from a cache, and still catches the one case the check
// exists for: an edit to `src` without a rebuild.
//
// Build-free ESM on purpose: the shim runs before anything is compiled.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The newest mtime (ms) of any non-spec file under `srcDir`. A stat-only walk — much
 * cheaper than reading and hashing every file — so the shim can skip the full
 * fingerprint when the build stamp is already newer than every source. It is only ever
 * used to prove freshness in ONE direction: an mtime can make the stamp look older than
 * it is (a checkout/cache restore rewrites source mtimes to "now"), never newer, so a
 * source-newer-than-stamp result is ambiguous and must be confirmed by content. */
export function newestSrcMtimeMs(srcDir) {
  let newest = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (!entry.name.endsWith('.spec.ts')) newest = Math.max(newest, statSync(full).mtimeMs);
    }
  };
  walk(srcDir);
  return newest;
}

/** SHA-256 over every non-spec file under `srcDir`, path and content, in a stable
 * order. Spec files never reach dist, so editing a test must not read as stale. */
export function srcFingerprint(srcDir) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (!entry.name.endsWith('.spec.ts')) files.push(full);
    }
  };
  walk(srcDir);
  files.sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}
