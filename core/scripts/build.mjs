// The build. esbuild BUNDLES the source into one runnable ESM file, because the
// engine is executed directly by node (the shim imports dist, and a consumer's
// `.specwarden/warden.config.mjs` imports 'specwarden' → dist) — and node's ESM
// loader does not resolve the barrel/directory imports that tsc leaves in place.
// tsc then emits the type declarations beside it. There are no runtime
// dependencies, so only the source is bundled and node builtins stay external.
import { rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';

import { srcFingerprint } from './src-fingerprint.mjs';

const pkgDir = dirname(dirname(fileURLToPath(import.meta.url)));

rmSync('dist', { recursive: true, force: true });

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  // Must never sit below the oldest runtime whose APIs the source actually calls —
  // esbuild lowers SYNTAX, not library surface, so a target below that compiles clean
  // and then throws on import. It said `node20` while `NodeFileSource` imported
  // `fs.globSync` (node 22+), so every pre-push on a node 20 shell died with a bare
  // `does not provide an export named 'globSync'` instead of a version complaint.
  // The floor is 24 rather than 22 because the glob dot-semantics the file-source
  // contract pins were verified there and are experimental below it.
  target: 'node24',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
});

// Types beside the bundle. Declaration-only: the runnable code is the bundle above.
//
// tsc is invoked through THIS node, by path, rather than through `pnpm exec`. On Windows
// `execFileSync('pnpm', …)` cannot find pnpm at all: without `shell: true` node does no
// PATHEXT resolution, so `pnpm.cmd` is invisible and the call dies with
// `spawnSync pnpm ENOENT` — after the bundle is written but BEFORE the `.srchash` stamp
// below, which then makes every `pnpm gate` refuse with "dist is stale". The whole gate
// runner was therefore unreachable on a Windows checkout.
//
// `shell: true` would also have worked and is worse: it puts the argument list through a
// command interpreter, and it keeps the dependency on pnpm being on PATH. tsc ships as a
// plain JS entry point, so the current interpreter can just run it.
execFileSync(
  process.execPath,
  [
    join(pkgDir, 'node_modules', 'typescript', 'bin', 'tsc'),
    '-p',
    'tsconfig.json',
    '--emitDeclarationOnly',
    '--declaration',
  ],
  { stdio: 'inherit', cwd: pkgDir },
);

// Stamp the source fingerprint beside the bundle. The shim compares this to a live
// fingerprint of src to tell "built from this source" from "stale" — by content,
// so it survives a git checkout or a cache restore where mtimes lie.
writeFileSync(join(pkgDir, 'dist', '.srchash'), srcFingerprint(join(pkgDir, 'src')));
