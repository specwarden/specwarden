/**
 * The playgrounds: one real repository per template, generated and committed.
 *
 * ## Why they are committed rather than produced in a temp directory
 *
 * A template emits STRINGS. No compiler reads a string, so a module option renamed
 * anywhere leaves every template compiling happily and producing a tree that throws on
 * its first run — and the first run is what decides whether the tool is kept. A test in
 * a temp directory catches that, and catches it invisibly: nobody reviews a tree that
 * existed for four hundred milliseconds inside a test process.
 *
 * Committed, the tree is in the diff. "This template now writes a check nobody asked
 * for" is a review comment rather than an archaeology exercise, and the day a template's
 * output changes, the change is the thing being reviewed.
 *
 * ## What is checked about them
 *
 * Two things, and they are different questions:
 *
 * 1. the committed tree is EXACTLY what `init --template <name>` writes today — the
 *    regenerable property, so a playground cannot quietly stop describing its template;
 * 2. the tree is GREEN under `check --all` with nothing edited in between — which is the
 *    promise a template actually makes, and the only one a consumer feels on day one.
 *
 * Run: node scripts/playgrounds.mjs          (verify)
 *      node scripts/playgrounds.mjs --write  (regenerate)
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';

import { PACKAGES, pkgDeps } from './registry.mjs';

const ROOT = process.cwd();
export const PLAYGROUNDS_DIR = '_playgrounds';

/** Every template that gets a playground. The parts package is not a template: it is
 * what templates are assembled from, and it scaffolds nothing on its own. */
export const TEMPLATED = PACKAGES.filter((p) => p.kind === 'template');

/** The CLI, run out of this repository rather than an installed copy. */
const WARDEN = join(ROOT, 'core', 'bin', 'warden.mjs');

const run = (args, cwd, env = {}) =>
  execFileSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

/**
 * The repository a template is scaffolded INTO.
 *
 * Generated from the registry rather than kept as a fixture, and for a reason `init`
 * enforces: a template refuses to write a tree whose repository has not declared the
 * packages its checks will import, because such a tree fails on its first run. So the
 * seed declares exactly the template's own dependencies — what a consumer who followed
 * the install instructions would have, and nothing more.
 *
 * It carries a README because `init` DETECTS what it is writing for: a template writes a
 * part only where its subject exists. Scaffolding into an empty directory would produce
 * a playground describing a repository nobody has.
 */
function seed(dir, pkg) {
  const devDependencies = Object.fromEntries(pkgDeps(pkg).map((name) => [name, 'workspace:*']));
  const manifest = {
    name: `playground-${pkg.slug}`,
    private: true,
    type: 'module',
    scripts: { gate: 'specwarden check' },
    devDependencies,
  };
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const readme = [
    `# playground: ${pkg.slug}`,
    '',
    `What \`specwarden init --template ${pkg.slug}\` writes, committed so a template's output is`,
    'reviewed in a diff rather than inside a test process nobody reads.',
    '',
    'Generated. Run `node scripts/playgrounds.mjs --write` from the repository root.',
    '',
  ].join('\n');
  writeFileSync(join(dir, 'README.md'), readme);
}

/** Scaffold one template into a fresh directory and return the path. */
function scaffoldInto(dir, pkg) {
  mkdirSync(dir, { recursive: true });
  seed(dir, pkg);
  linkModules(dir);
  run([WARDEN, 'init', '--template', pkg.slug], dir);
  return dir;
}

/**
 * Point a scaffolded tree at this repository's installed packages.
 *
 * `init` resolves a template by IMPORTING it, and node resolves a bare specifier by
 * walking up from the importing file — which for a scratch directory outside the
 * workspace finds nothing. `NODE_PATH` does not help: it is a CommonJS mechanism and
 * these are ESM imports.
 *
 * A link rather than an install, because what is being tested is the template's OUTPUT,
 * not npm: installing eighteen packages per playground would add minutes to a check that
 * answers a question about strings. The tarball path is verified separately, by
 * `verify-build.mjs`, which is the place that question belongs.
 */
function linkModules(dir) {
  const at = join(dir, 'node_modules');
  if (existsSync(at)) return;
  symlinkSync(join(ROOT, 'node_modules'), at, process.platform === 'win32' ? 'junction' : 'dir');
}

/** Every file under a directory, repository-relative, sorted — so two readings of one
 * tree compare in a stable order. */
function treeOf(dir) {
  const out = [];
  const walk = (at) => {
    for (const entry of readdirSync(at, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === 'node_modules') continue;
      const full = join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(relative(dir, full).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

export function regenerate() {
  for (const pkg of TEMPLATED) {
    const target = join(ROOT, PLAYGROUNDS_DIR, pkg.slug);
    rmSync(target, { recursive: true, force: true });
    scaffoldInto(target, pkg);
  }
  return TEMPLATED.length;
}

/** The problems, as human strings. Empty means every playground is current and green. */
export function verify() {
  const problems = [];

  for (const pkg of TEMPLATED) {
    const committed = join(ROOT, PLAYGROUNDS_DIR, pkg.slug);
    if (!existsSync(committed)) {
      problems.push(`${pkg.slug}: no playground — run \`node scripts/playgrounds.mjs --write\`.`);
      continue;
    }

    const scratch = mkdtempSync(join(tmpdir(), `specwarden-pg-${pkg.slug}-`));
    try {
      scaffoldInto(scratch, pkg);

      const fresh = treeOf(scratch);
      const have = treeOf(committed);
      const missing = fresh.filter((f) => !have.includes(f));
      const extra = have.filter((f) => !fresh.includes(f));
      if (missing.length)
        problems.push(
          `${pkg.slug}: the template now writes ${missing.join(', ')}, which the playground does not have.`,
        );
      if (extra.length)
        problems.push(`${pkg.slug}: the playground carries ${extra.join(', ')}, which the template no longer writes.`);

      for (const file of fresh.filter((f) => have.includes(f))) {
        const a = readFileSync(join(scratch, file), 'utf8');
        const b = readFileSync(join(committed, file), 'utf8');
        if (a !== b) problems.push(`${pkg.slug}/${file}: differs from what the template writes today.`);
      }

      // The promise a template actually makes.
      try {
        linkModules(committed);
        run([WARDEN, 'check', '--all'], committed);
      } catch (error) {
        const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim().split('\n').slice(-4).join(' / ');
        problems.push(`${pkg.slug}: the scaffolded tree is not green — ${output}`);
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }

  return problems;
}

if (process.argv[1]?.endsWith('playgrounds.mjs')) {
  if (process.argv.includes('--write')) {
    process.stdout.write(`regenerated ${regenerate()} playground(s)\n`);
  } else {
    const problems = verify();
    if (problems.length) {
      process.stderr.write(
        `${problems.length} playground problem(s):\n\n${problems.map((p) => `  - ${p}`).join('\n')}\n`,
      );
      process.exit(1);
    }
    process.stdout.write(`✓ ${TEMPLATED.length} playground(s) current and green\n`);
  }
}

/** Exported for the gate that wraps this, and for its own test. */
export const playgroundCount = () => TEMPLATED.length;
