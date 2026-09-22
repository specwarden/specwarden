import { defineConfig } from 'tsup';

/**
 * Package build: one ESM bundle plus its `.d.ts`.
 *
 * A BUNDLER rather than `tsc`, because `tsc` emits relative specifiers as written —
 * without extensions — and node's ESM loader cannot resolve them.
 *
 * `target` is the node floor and must never sit below the oldest runtime whose APIs the
 * sources actually call: esbuild lowers syntax, not library surface, so a lower target
 * compiles clean and then throws on import.
 *
 * GENERATED from `scripts/registry.mjs`. Edit the registry.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  platform: 'node',
  target: 'node24',
  // Nothing outside this package is bundled in: a workspace sibling is a real
  // dependency at runtime, and inlining it would ship a second copy of the engine
  // inside every module that uses it.
  skipNodeModulesBundle: true,
});
