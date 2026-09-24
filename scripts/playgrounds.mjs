/**
 * The template playgrounds: one consumer's repository per template, inside the template's
 * own package, with the tree `init` wrote into it committed beside it.
 *
 * ```
 * templates/<name>/_playground/
 *   playground.spec.ts   the proof — run by the template's own suite
 *   repository/          a repository of the kind the template is FOR, and in it
 *     .specwarden/       exactly what `init --template <name>` writes there — GENERATED
 * ```
 *
 * ## Why a real repository, and not an empty directory
 *
 * These trees used to be `init` run over a README and a package.json. Every one was green,
 * and green for the wrong reason: there was nothing in it to check. A docs template over
 * no documents, a NestJS template over no modules, a monorepo template whose lockfile check
 * resolved upwards and checked THIS repository's lockfile. Worse, `init` detects what it is
 * writing for — no workflow, no CI-coverage check; no compose file, no env-file check — so
 * the empty seed switched off exactly the parts a real consumer would get. The playground
 * described a repository nobody has.
 *
 * ## Why committed, and not produced in a temp directory
 *
 * A template emits STRINGS. No compiler reads a string, so a module option renamed
 * anywhere leaves every template compiling and producing a tree that throws on its first
 * run. A test in a temp directory catches that invisibly — nobody reviews a tree that
 * existed for four hundred milliseconds. Committed, "this template now writes a check
 * nobody asked for" is a line in a diff.
 *
 * ## What is checked, and where
 *
 * - HERE (`verify`, the `playgrounds` check): the committed `.specwarden/` is exactly what
 *   `init` writes into that repository today.
 * - IN `playground.spec.ts` (the `unit` check): the repository is green under `check --all`
 *   with nothing edited, and the same repository with one defect per check is red for
 *   EVERY check the template wrote — so no generated check can be one that cannot fail.
 *
 * Both run in a scratch copy under git, never in place: a check reads TRACKED files, and a
 * run in place would answer differently before and after somebody's `git add`.
 *
 * Run: node scripts/playgrounds.mjs          (verify)
 *      node scripts/playgrounds.mjs --write [<template>…]  (regenerate `.specwarden/`)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SELF_CHECK_IDS } from 'specwarden';

import { PACKAGES, pkgDeps, pkgDir, pkgName } from './registry.mjs';

/** The repository root, from this file rather than from `cwd` — a template's suite runs
 * with its own package as the working directory. */
export const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Every template, and so every playground. The parts package is not a template. */
export const TEMPLATED = PACKAGES.filter((p) => p.kind === 'template');

export const CONFIG_DIR = '.specwarden';
export const playgroundDir = (pkg) => join(ROOT, pkgDir(pkg), '_playground');
export const repositoryDir = (pkg) => join(playgroundDir(pkg), 'repository');

/** The CLI, run out of this repository rather than an installed copy. */
const ENGINE = join(ROOT, 'core', 'bin', 'specwarden.mjs');

/** What a tree walk never descends into: installed packages and a checkout's own git. */
const NEVER = new Set(['node_modules', '.git']);

/** Every file under a directory, relative and forward-slashed, sorted. */
export function treeOf(dir, { skip = [] } = {}) {
  const out = [];
  const walk = (at) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      if (NEVER.has(entry.name)) continue;
      const full = join(at, entry.name);
      const rel = relative(dir, full).split(sep).join('/');
      if (skip.some((s) => rel === s || rel.startsWith(`${s}/`))) continue;
      if (entry.isDirectory()) walk(full);
      else out.push(rel);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out.sort();
}

/**
 * The environment every spawned process gets: the caller's, with colour off and the
 * relevance filter disarmed.
 *
 * Deliberately NOTHING about the shell. This used to put Git's `bash.exe` first on the PATH,
 * because on Windows a bare `bash` is often WSL's launcher and a wrapped `npm test` then ran
 * inside Linux. The engine resolves Git's own bash itself now (`resolveShell`), and a
 * playground run from PowerShell is how that resolution is proved — a PATH arranged here
 * would prove only that the proof had arranged it.
 */
export function playgroundEnv() {
  // NODE_PATH is dropped. pnpm's bin shim exports it pointing at the workspace's own
  // `node_modules`, and module resolution through `createRequire` honours it — so a scratch
  // repository that installed only the engine found every package in the workspace, and a
  // scene about "a consumer without the module" was a scene about nothing.
  const env = { ...process.env, SPECWARDEN_ALL: '1', NO_COLOR: '1', FORCE_COLOR: '0' };
  delete env.NODE_PATH;
  return env;
}

const git = (dir, args) =>
  execFileSync('git', ['-c', 'user.name=playground', '-c', 'user.email=playground@specwarden.invalid', ...args], {
    cwd: dir,
    stdio: 'ignore',
    env: playgroundEnv(),
  });

/**
 * Make what a consumer of this template would have installed resolvable from `dir`.
 *
 * EXACTLY that, and no more: the template itself and its own dependencies, each linked to
 * the workspace copy. Linking the whole workspace `node_modules` would let a generated
 * check import a module the template never declared, and the tree would pass here and
 * throw for the first consumer who installed what the README told them to.
 */
export function linkInstalled(dir, pkg) {
  linkPackages(dir, [
    [pkgName(pkg), join(ROOT, pkgDir(pkg))],
    // Resolved from the TEMPLATE's own node_modules, which pnpm fills from its manifest —
    // so a dependency the registry forgot to give the template is missing here too.
    ...pkgDeps(pkg).map((name) => [name, join(ROOT, pkgDir(pkg), 'node_modules', ...name.split('/'))]),
  ]);
}

/** Link each `[name, source]` into `dir/node_modules` — junctions, so no admin rights. */
export function linkPackages(dir, installed) {
  for (const [name, source] of installed) {
    const at = join(dir, 'node_modules', ...name.split('/'));
    if (existsSync(at)) continue;
    mkdirSync(dirname(at), { recursive: true });
    symlinkSync(realpathSync(source), at, 'junction');
  }
}

/** Write `edits` over `dir`: path → contents, or `null` to delete a file or a directory. */
function plant(dir, edits) {
  for (const [rel, text] of Object.entries(edits)) {
    const full = join(dir, rel);
    if (text === null) rmSync(full, { recursive: true, force: true });
    else {
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, text);
    }
  }
}

/** Put `dir` under git at one commit, with `branches` created there. */
function commit(dir, branches) {
  git(dir, ['init', '--quiet', '--initial-branch=main']);
  // Kept out of the index the way a clone keeps it out — but in `.git/info/exclude`, so the
  // repository under test is not given a `.gitignore` it does not have.
  writeFileSync(join(dir, '.git', 'info', 'exclude'), 'node_modules/\n');
  git(dir, ['add', '--all']);
  git(dir, ['commit', '--quiet', '--no-verify', '--allow-empty', '-m', 'playground']);
  // `main` is the branch the commit is already on.
  for (const branch of branches.filter((b) => b !== 'main')) git(dir, ['branch', branch]);
}

/**
 * A scratch copy of a template's repository, under git, ready to run.
 *
 * `edits` maps a path to its new contents, or to `null` to delete it (a directory too) —
 * the defects a spec plants. `withConfig: false` leaves the generated `.specwarden/` out,
 * which is the tree `init` is run over. `branches` are created at the one commit — what a
 * plan's `**Branch:**` has to resolve to while its work is under way.
 */
export function scratchRepository(pkg, { edits = {}, withConfig = true, branches = [] } = {}) {
  const source = repositoryDir(pkg);
  if (!existsSync(source)) throw new Error(`${pkgName(pkg)} has no playground repository at ${source}`);
  const dir = mkdtempSync(join(tmpdir(), `specwarden-${pkg.slug}-`));
  for (const rel of treeOf(source, { skip: withConfig ? [] : [CONFIG_DIR] })) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    cpSync(join(source, rel), join(dir, rel));
  }
  // Installed BEFORE the defects are planted: a defect may be a manifest changed without
  // its lockfile, and the install is the consumer's state from before that edit.
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) installWithPnpm(dir, source);
  else linkInstalled(dir, pkg);
  plant(dir, edits);
  commit(dir, branches);
  return dir;
}

/**
 * A scratch repository from a described tree — the workspace playground's, which composes
 * every package rather than being one template's output. `installed` is `[name, source]`
 * pairs: what this consumer has installed, and where each resolves from.
 */
export function scratchTree(tree, { installed = [], branches = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'specwarden-workspace-'));
  plant(dir, tree);
  linkPackages(dir, installed);
  commit(dir, branches);
  return dir;
}

/**
 * A pnpm workspace is installed by pnpm, because its own checks run pnpm.
 *
 * The monorepo template writes a lockfile check that runs `pnpm install --frozen-lockfile`
 * — a real install. Hand-linked packages would make that install a fight with a layout pnpm
 * did not write. So the repository declares the engine with `link:` paths relative to where
 * it is COMMITTED (installable in place, and its lockfile is ordinary pnpm output), and
 * here those paths are rebased onto the scratch copy and the workspace is installed
 * offline — the engine packages are links, and nothing is fetched.
 */
function installWithPnpm(dir, source) {
  const manifestPath = join(dir, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const field of ['dependencies', 'devDependencies']) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      if (!String(spec).startsWith('link:')) continue;
      const target = realpathSync(join(source, String(spec).slice('link:'.length)));
      manifest[field][name] = `link:${target.split(sep).join('/')}`;
    }
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  // One command string through the shell: `pnpm` is `pnpm.cmd` on Windows, which only a
  // shell resolves, and node refuses to pass an argument list to one without a warning.
  const r = spawnSync('pnpm install --offline --ignore-scripts --no-frozen-lockfile', {
    cwd: dir,
    encoding: 'utf8',
    env: playgroundEnv(),
    shell: true,
  });
  if (r.status !== 0)
    throw new Error(`pnpm install in the scratch workspace exited ${r.status}:\n${r.stdout}${r.stderr}`);
}

export const removeScratch = (dir) => rmSync(dir, { recursive: true, force: true, maxRetries: 5 });

/** Run the CLI in `dir`. Never throws on a non-zero exit: the exit IS the answer. */
export function specwarden(dir, args, { timeoutSec = 300, input } = {}) {
  const r = spawnSync(process.execPath, [ENGINE, ...args], {
    cwd: dir,
    input,
    encoding: 'utf8',
    env: playgroundEnv(),
    timeout: timeoutSec * 1000,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/**
 * `check --all --json` in `dir`, parsed: every check's id, whether it held, and what it
 * said. The exit code is carried beside it, because a run whose JSON says "all ok" and
 * whose exit is 1 is a finding about the engine rather than about the tree.
 */
export function verdictsIn(dir) {
  const run = specwarden(dir, ['check', '--all', '--json']);
  let parsed;
  try {
    parsed = JSON.parse(run.stdout);
  } catch {
    throw new Error(`check --json printed no JSON (exit ${run.status}):\n${run.stdout}\n${run.stderr}`);
  }
  const results = parsed.results.map((r) => ({
    id: r.id,
    ok: r.ok,
    skipped: r.skipped,
    messages: (r.findings ?? []).map((f) => f.message),
  }));
  return { status: run.status, results, failed: results.filter((r) => !r.ok && !r.skipped).map((r) => r.id) };
}

/**
 * The checks a TEMPLATE wrote, out of everything a run reported.
 *
 * The rest are the self-checks, and the engine publishes their ids. Asked of
 * the engine rather than listed here: a list kept by hand goes stale the day a self-check
 * is added, and every playground would then demand a defect for a check it never
 * wrote.
 */
export const writtenByTemplate = (ids) => ids.filter((id) => !SELF_CHECK_IDS.includes(id));

/** What `init --template <name>` writes into this template's repository today, as
 * path → contents under `.specwarden/`. */
export function freshConfig(pkg) {
  const dir = scratchRepository(pkg, { withConfig: false });
  try {
    const run = specwarden(dir, ['init', '--template', pkg.slug]);
    if (run.status !== 0)
      throw new Error(`init --template ${pkg.slug} exited ${run.status}:\n${run.stdout}${run.stderr}`);
    const out = new Map();
    for (const rel of treeOf(join(dir, CONFIG_DIR))) out.set(rel, readFileSync(join(dir, CONFIG_DIR, rel), 'utf8'));
    return out;
  } finally {
    removeScratch(dir);
  }
}

/** Rewrite the `.specwarden/` of every playground — or of the templates named. */
export function regenerate(slugs = []) {
  const chosen = slugs.length ? TEMPLATED.filter((p) => slugs.includes(p.slug)) : TEMPLATED;
  if (chosen.length !== (slugs.length || TEMPLATED.length))
    throw new Error(`no such template among: ${slugs.join(', ')}`);
  for (const pkg of chosen) {
    const fresh = freshConfig(pkg);
    const target = join(repositoryDir(pkg), CONFIG_DIR);
    rmSync(target, { recursive: true, force: true });
    for (const [rel, text] of fresh) {
      mkdirSync(dirname(join(target, rel)), { recursive: true });
      writeFileSync(join(target, rel), text);
    }
  }
  return chosen.length;
}

/** The problems, as human strings. Empty means every playground is current. */
export function verify() {
  const problems = [];
  for (const pkg of TEMPLATED) {
    const where = `${pkgDir(pkg)}/_playground`;
    if (!existsSync(join(playgroundDir(pkg), 'playground.spec.ts'))) {
      problems.push(`${where}: no playground.spec.ts — nothing proves the tree is green, or that its checks can fail.`);
    }
    if (!existsSync(repositoryDir(pkg))) {
      problems.push(`${where}: no repository/ — a template needs a repository of its kind to be scaffolded into.`);
      continue;
    }

    const fresh = freshConfig(pkg);
    const target = join(repositoryDir(pkg), CONFIG_DIR);
    const have = treeOf(target);
    const missing = [...fresh.keys()].filter((f) => !have.includes(f));
    const extra = have.filter((f) => !fresh.has(f));
    if (missing.length)
      problems.push(`${where}: the template now writes ${missing.join(', ')}, which the playground does not have.`);
    if (extra.length)
      problems.push(`${where}: the playground carries ${extra.join(', ')}, which the template no longer writes.`);
    for (const [rel, text] of fresh) {
      if (have.includes(rel) && readFileSync(join(target, rel), 'utf8') !== text) {
        problems.push(`${where}/repository/${CONFIG_DIR}/${rel}: differs from what the template writes today.`);
      }
    }
  }
  return problems;
}

if (process.argv[1]?.endsWith(`${sep}playgrounds.mjs`) || process.argv[1]?.endsWith('/playgrounds.mjs')) {
  if (process.argv.includes('--write')) {
    const slugs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    process.stdout.write(`regenerated ${regenerate(slugs)} playground config(s)\n`);
  } else {
    const problems = verify();
    if (problems.length) {
      process.stderr.write(
        `${problems.length} playground problem(s):\n\n${problems.map((p) => `  - ${p}`).join('\n')}\n`,
      );
      process.exit(1);
    }
    process.stdout.write(`✓ ${TEMPLATED.length} playground config(s) are what their templates write today\n`);
  }
}
