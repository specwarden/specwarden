import { mkdtempSync, mkdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// The bin shim is a build-free script that runs before anything is compiled, so it is
// not imported here; instead this pins the two helpers its freshness decision is built
// from (packages/specwarden/scripts/src-fingerprint.mjs). The decision: the stamp is
// fresh when it is at least as new as every source file (mtime fast path); a
// source-newer-than-stamp mtime is ambiguous and is confirmed by the content
// fingerprint, which is the authority.
import { newestSrcMtimeMs, srcFingerprint } from '../../scripts/src-fingerprint.mjs';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'spw-fresh-'));
  dirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

describe('shim freshness helpers', () => {
  it('srcFingerprint changes with content but ignores .spec.ts files', () => {
    // Mutate files in place within ONE tree: the fingerprint hashes absolute paths, so
    // it is only meaningful for the same directory across time (which is how the shim
    // uses it — one src dir, before and after an edit).
    const root = tree({ 'index.ts': 'export const x = 1;\n', 'index.spec.ts': 'test one\n' });
    const base = srcFingerprint(root);

    writeFileSync(join(root, 'index.spec.ts'), 'a totally different test\n');
    expect(srcFingerprint(root)).toBe(base); // spec content does not move the fingerprint

    writeFileSync(join(root, 'index.ts'), 'export const x = 2;\n');
    expect(srcFingerprint(root)).not.toBe(base); // a real source change does
  });

  it('newestSrcMtimeMs reflects the newest non-spec file and ignores specs', () => {
    const root = tree({ 'a.ts': 'a\n', 'nested/b.ts': 'b\n', 'a.spec.ts': 'spec\n' });
    const old = new Date('2020-01-01T00:00:00Z');
    const mid = new Date('2021-01-01T00:00:00Z');
    const future = new Date('2999-01-01T00:00:00Z');
    utimesSync(join(root, 'a.ts'), old, old);
    utimesSync(join(root, 'nested/b.ts'), mid, mid);
    utimesSync(join(root, 'a.spec.ts'), future, future); // newest, but a spec — ignored

    expect(newestSrcMtimeMs(root)).toBe(mid.getTime());
  });

  it('models the shim decision: fresh skips, mtime-skew confirms fresh by content, a real edit is stale', () => {
    const root = tree({ 'index.ts': 'export const x = 1;\n' });
    const stamp = srcFingerprint(root);

    // Fresh: stamp mtime newer than every source ⇒ fast path passes, no hash needed.
    const stampMtime = statSync(join(root, 'index.ts')).mtimeMs + 1000;
    expect(newestSrcMtimeMs(root) > stampMtime).toBe(false);

    // Skew: source mtime bumped to "now" (a checkout/cache restore) but content is the
    // same ⇒ fast path is ambiguous, and the content confirms fresh.
    const future = new Date(Date.now() + 60_000);
    utimesSync(join(root, 'index.ts'), future, future);
    expect(newestSrcMtimeMs(root) > stampMtime).toBe(true);
    expect(srcFingerprint(root)).toBe(stamp); // content unchanged ⇒ not stale

    // Real edit ⇒ content diverges from the stamp ⇒ stale.
    writeFileSync(join(root, 'index.ts'), 'export const x = 2;\n');
    expect(srcFingerprint(root)).not.toBe(stamp);
  });
});
