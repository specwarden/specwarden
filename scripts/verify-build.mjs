/**
 * Packs every package, installs the tarballs into a temporary project, and imports from
 * them.
 *
 * ## Why this, and not a check that the files exist
 *
 * "The build works" is unfalsifiable until somebody installs the result. Asserting that
 * `dist/index.js` exists proves a file exists and says nothing about what a consumer
 * will experience. What actually breaks fails here:
 *
 * - **a missing or wrong `.d.ts`** — the consumer gets an untyped package and learns
 *   about it from their own `tsc`, not from ours;
 * - **a `files` list that forgot something** — locally every path is in place, so the
 *   omission is invisible until the tarball is the only thing there is. The engine's
 *   `bin/` is the live example: the CLI shim is deliberately not compiled, so a `files`
 *   list carrying only `dist` installs a `specwarden` command that cannot start;
 * - **a `workspace:` range that reached what shipped** — pnpm substitutes a real version
 *   at pack time, and the one case where it does not is the one nobody would notice
 *   until `npm install` failed for a stranger.
 *
 * ## Tarballs, not folder links
 *
 * `npm install ../core` symlinks the directory and picks up everything a published
 * package will not contain. A tarball is assembled from `files` — what actually ships.
 *
 * Run: node scripts/verify-build.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PACKAGES, pkgDir, pkgName } from './registry.mjs';

const ROOT = process.cwd();

/**
 * What must arrive from each package's entry point.
 *
 * A NAMED symbol rather than a bare import: a module that imported and exported nothing
 * is also a failure, just a quieter one — and the quiet ones are what this repository
 * exists against.
 */
const ENTRY_SYMBOL = {
  specwarden: 'defineCheck',
  '@specwarden/docs': 'docPaths',
  '@specwarden/plans': 'planShape',
  '@specwarden/ops': 'envFilesAgree',
  '@specwarden/security': 'secretScan',
  '@specwarden/agents': 'agentDefinitions',
  '@specwarden/openspec': 'openspec',
  '@specwarden/speckit': 'speckit',
  '@specwarden/plugin-nestjs': 'nestjs',
};

/**
 * A package manager's name on this platform.
 *
 * Without it, `execFileSync('pnpm', …)` finds nothing on Windows: node does no PATHEXT
 * resolution for a bare name, so `pnpm.cmd` is invisible and the call dies with
 * `spawnSync pnpm ENOENT` — which reads as "the build is broken" rather than "this
 * script could not start a process". The repository met exactly this before, in the
 * build script this one replaced.
 *
 * A name rather than `shell: true`: a shell would put the argument list through an
 * interpreter, which is a larger change for a smaller reason.
 */
const WINDOWS = process.platform === 'win32';
const bin = (name) => (WINDOWS ? `${name}.cmd` : name);

/**
 * Run a program, and on Windows run a package manager through a shell.
 *
 * TWO platform facts collide here, and each one alone is survivable:
 *
 * 1. node does no PATHEXT resolution for a bare name, so `pnpm` is invisible and the
 *    call dies with `spawnSync pnpm ENOENT` — which reads as "the build is broken";
 * 2. since the 2024 hardening, node REFUSES to spawn a `.cmd` or `.bat` without a
 *    shell, with `spawnSync pnpm.cmd EINVAL` — so naming the extension trades one
 *    unreadable failure for another.
 *
 * `shell: true` is therefore not a shortcut here, it is the only arrangement that runs.
 * It costs an interpreter parsing the argument list, which is why every argument is
 * quoted: a temporary directory on Windows sits under a path with spaces in it, and an
 * unquoted one silently becomes two arguments.
 *
 * Nothing untrusted reaches this. Every argument is a path this script produced.
 */
const run = (cmd, args, cwd) => {
  const shell = WINDOWS && cmd.endsWith('.cmd');
  const argv = shell ? args.map((a) => (/[\s"]/.test(a) ? `"${a.replaceAll('"', '\\"')}"` : a)) : args;
  return execFileSync(cmd, argv, { cwd, encoding: 'utf8', shell, stdio: ['ignore', 'pipe', 'pipe'] });
};

const scratch = mkdtempSync(join(tmpdir(), 'specwarden-verify-'));
const problems = [];

try {
  // Pack first, from the repository, so a failure to pack is reported as itself.
  const tarballs = new Map();
  for (const pkg of PACKAGES) {
    const dir = join(ROOT, pkgDir(pkg));
    const out = run(bin('pnpm'), ['pack', '--pack-destination', scratch], dir).trim().split('\n').pop().trim();
    tarballs.set(pkgName(pkg), out);
  }

  writeFileSync(
    join(scratch, 'package.json'),
    `${JSON.stringify({ name: 'verify', private: true, type: 'module' }, null, 2)}\n`,
  );
  run(bin('npm'), ['install', '--no-audit', '--no-fund', ...tarballs.values()], scratch);

  // Import each entry and read a symbol out of it.
  for (const [name, symbol] of Object.entries(ENTRY_SYMBOL)) {
    const probe = join(scratch, `probe-${name.replace(/[^a-z0-9]+/gi, '-')}.mjs`);
    writeFileSync(
      probe,
      `import * as mod from ${JSON.stringify(name)};\n` +
        `if (typeof mod[${JSON.stringify(symbol)}] === 'undefined') {\n` +
        `  console.error(${JSON.stringify(`${name}: imported, but exports no ${symbol}`)});\n` +
        '  process.exit(1);\n' +
        '}\n',
    );
    try {
      run(process.execPath, [probe], scratch);
    } catch (error) {
      problems.push(
        `${name}: ${
          String(error.stderr || error.message)
            .trim()
            .split('\n')[0]
        }`,
      );
    }
  }

  // The CLI is the one entry a consumer reaches without importing anything, and the one
  // whose files are NOT compiled. It exits 2 with no arguments by design; what is being
  // proved is that node could load the shim at all.
  try {
    run(process.execPath, [join(scratch, 'node_modules', 'specwarden', 'bin', 'warden.mjs')], scratch);
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    if (!output.includes('usage: specwarden')) {
      problems.push(`specwarden: the installed CLI did not start — ${output.trim().split('\n')[0]}`);
    }
  }

  /**
   * What is in the installed copy.
   *
   * The INSTALLED manifest is the packed one, which is why the `workspace:` check reads
   * it here rather than unpacking a tarball: a range surviving the pack is only visible
   * from what actually shipped, and reading it from `node_modules` needs no `tar` — one
   * fewer program that has to exist on the machine running this.
   */
  for (const name of tarballs.keys()) {
    const installed = join(scratch, 'node_modules', ...name.split('/'));
    const packed = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));

    for (const [dep, range] of Object.entries(packed.dependencies ?? {})) {
      if (String(range).startsWith('workspace:')) {
        problems.push(
          `${name}: the published manifest still says \`${dep}: ${range}\` — a consumer's install would fail on a protocol npm does not speak.`,
        );
      }
    }

    const dist = readdirSync(join(installed, 'dist'));
    if (!dist.includes('index.d.ts'))
      problems.push(`${name}: no index.d.ts in the tarball — the consumer gets an untyped package.`);
    if (!readdirSync(installed).includes('LICENSE')) problems.push(`${name}: no LICENSE in the tarball.`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

if (problems.length > 0) {
  process.stderr.write(`the built packages are not usable:\n\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`✓ ${PACKAGES.length} package(s) pack, install and import\n`);
