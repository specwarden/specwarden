// esbuild bundles the plugin's source into one ESM file and tsc emits the declarations
// beside it — the same shape as the engine's build, and for the same reason: a consumer's
// config imports this package directly and node's ESM loader will not resolve the barrel
// imports tsc leaves behind. `specwarden` stays external: the consumer already has it, and
// bundling a second copy would give the plugin its own check registry.
import { rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

rmSync('dist', { recursive: true, force: true });

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
});

execFileSync('node', ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json', '--emitDeclarationOnly', '--declaration'], {
  stdio: 'inherit',
});
