/**
 * Generates every package's manifest, build config and documentation from the registry.
 *
 * Idempotent, and it overwrites only ITS OWN files — `package.json`, `tsconfig.json`,
 * `tsup.config.ts`, `README.md` and the per-package `LICENSE`. It never touches sources,
 * tests or a hand-written `SKILL.md`.
 *
 * A script rather than eighteen pairs of hands because what a README states — the kind,
 * the rule, what it depends on — must agree with the manifest beside it. Here there is
 * no second copy to disagree with: one copy, derived.
 *
 * Run: node scripts/scaffold.mjs
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { KINDS, ORIGIN, PACKAGES, TOOLCHAIN, byName, pkgDeps, pkgDir, pkgName } from './registry.mjs';
import { generateLlmsIndex } from './llms.mjs';
import { generatedSkillFiles } from './skills.mjs';

const ROOT = process.cwd();

const write = (rel, text) => {
  const full = join(ROOT, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text, 'utf8');
};

/** The version a package currently carries. Versions are owned by changesets, never by
 * this script: regenerating a manifest must not reset what a release set. */
const currentVersion = (pkg) => {
  try {
    return JSON.parse(readFileSync(join(ROOT, pkgDir(pkg), 'package.json'), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
};

// ── package.json ────────────────────────────────────────────────────────────────────

/**
 * What ships in the tarball.
 *
 * `dist` and the licence for every package; the engine adds `bin` and `scripts`, which
 * are NOT compiled — the CLI shim is deliberately build-free ESM so it runs in a fresh
 * clone before anything exists, and it imports its fingerprint helper as a sibling. A
 * `files` list that forgot either would publish a package whose `specwarden` command is
 * a broken import, and locally everything would look right because locally everything is
 * in place.
 */
const filesFor = (pkg) => ['dist', 'LICENSE', 'README.md', ...(pkg.extraFiles ?? []), ...(pkg.skill ? ['skills'] : [])];

function manifest(pkg) {
  const deps = Object.fromEntries(pkgDeps(pkg).map((name) => [name, 'workspace:^']));

  return `${JSON.stringify(
    {
      name: pkgName(pkg),
      version: currentVersion(pkg),
      type: 'module',
      description: `${KINDS[pkg.kind].label}: ${pkg.description}`,
      license: ORIGIN.license,
      repository: { type: 'git', url: `git+${ORIGIN.repository}.git`, directory: pkgDir(pkg) },
      homepage: `${ORIGIN.repository}/tree/main/${pkgDir(pkg)}#readme`,
      main: './dist/index.js',
      types: './dist/index.d.ts',
      exports: {
        '.': { types: './dist/index.d.ts', import: './dist/index.js', default: './dist/index.js' },
      },
      ...(pkg.bin ? { bin: pkg.bin } : {}),
      // Nothing here runs for its import side effects; saying so lets a consumer's
      // bundler drop what it does not use.
      sideEffects: false,
      files: filesFor(pkg),
      engines: { node: TOOLCHAIN.node },
      scripts: {
        build: 'tsup',
        lint: 'eslint src --max-warnings=0',
        test: 'vitest run',
        'test:coverage': 'vitest run --coverage',
        typecheck: 'tsc -p tsconfig.json --noEmit',
        // Builds on install so the normal path never meets a missing `dist`.
        prepare: 'pnpm run build',
        ...(pkg.extraScripts ?? {}),
      },
      ...(Object.keys(deps).length ? { dependencies: deps } : {}),
      devDependencies: {
        ...TOOLCHAIN.devDependencies,
        ...Object.fromEntries((pkg.devDeps ?? []).map((name) => [name, 'workspace:*'])),
        ...(pkg.extraDevDependencies ?? {}),
      },
    },
    null,
    2,
  )}\n`;
}

// ── tsconfig.json ───────────────────────────────────────────────────────────────────

const tsconfig = () =>
  `${JSON.stringify(
    {
      $schema: 'https://json.schemastore.org/tsconfig',
      extends: '../../tsconfig.base.json',
      // `noEmit`, because this program is for CHECKING. What ships is produced by the
      // bundler, which reads its own entry list — so a rootDir wide enough to hold the
      // playground costs nothing at build time and buys the typecheck below.
      compilerOptions: { noEmit: true },
      /**
       * The playground is part of the package's PROGRAM.
       *
       * It is a consumer written against the package's own published surface, so a
       * renamed export breaks the typecheck HERE — before somebody installs it. Left
       * outside the program, a playground compiles against nothing and proves nothing.
       */
      include: ['src/**/*', '_playground/**/*'],
      /**
       * The UNIT specs stay outside the program, and the playground stays in.
       *
       * A unit spec is written against internals with fixture shapes a production file
       * must not have — `skills/typescript/SKILL.md` owns that rule, and pulling them in
       * produced forty errors about test scaffolding the first time this was tried.
       *
       * The playground is the opposite case: it is a CONSUMER, written against the
       * package's published surface, so typechecking it is the only place a renamed
       * export is caught before somebody installs it.
       */
      /**
       * A template's playground carries a REPOSITORY — the stranger's tree `init` is run
       * in — and that tree is a fixture, not a consumer of this package: its sources
       * import an ORM nobody here installs, on purpose, because that is what the nestjs
       * plugin exists to catch.
       */
      exclude: ['dist', 'src/**/*.spec.ts', '_playground/repository/**'],
    },
    null,
    2,
  )}\n`;

/** The engine sits one level down, not two. */
const tsconfigFor = (pkg) =>
  pkgDir(pkg).split('/').length === 1
    ? tsconfig().replace('../../tsconfig.base.json', '../tsconfig.base.json')
    : tsconfig();

// ── vitest.config.ts ────────────────────────────────────────────────────────────────

/**
 * The test runner, for both suites a package has. Eighteen byte-identical copies of this
 * existed before it was generated.
 *
 * The coverage thresholds come from the package's registry entry, so the ratchet sits in
 * ONE file beside the measurement that set it. They were absent everywhere before — the
 * `test:coverage` script existed in every manifest and could not even start, because
 * nothing installed the provider — so "coverage is a ratchet" was a sentence in a skill
 * and nowhere else.
 */
export function vitestConfig(pkg) {
  const t = pkg.coverage;
  if (!t) throw new Error(`${pkgName(pkg)} has no \`coverage\` in the registry — every package carries its ratchet.`);
  const thresholds = `{ statements: ${t.statements}, branches: ${t.branches}, functions: ${t.functions}, lines: ${t.lines} }`;
  return [
    "import { defineConfig } from 'vitest/config';",
    '',
    '/**',
    ' * Two suites, one runner.',
    ' *',
    ' * A spec under `src/` is the UNIT suite: does this unit behave as described.',
    ' * A spec under `_playground/` is the PLAYGROUND: does everything this package',
    ' * PUBLISHES work, wired the way a consumer wires it, against a repository shaped like',
    ' * theirs.',
    ' *',
    ' * The second is not the first with more steps. A unit suite passes over a package whose',
    ' * factory was renamed and never re-exported, because it imports the unit by path; the',
    ' * playground imports the PACKAGE, so it cannot.',
    ' *',
    ' * `include` is pinned rather than left to the default, so the runner never picks up',
    ' * compiled tests a build emitted into `dist`.',
    ' *',
    ' * COVERAGE IS A RATCHET, not a target: add the missing test, never lower a threshold.',
    ' * Each number is the measurement minus one point, floored. Two runs of an unchanged',
    ' * suite differ in the hundredths on the async paths, and a threshold nailed to the best',
    ' * observation fails on a coin toss — a check that cries wolf stops being read.',
    ' *',
    ` * Measured ${t.measured}.`,
    ' *',
    ' * GENERATED from `scripts/registry.mjs`. Edit the registry.',
    ' */',
    'export default defineConfig({',
    '  test: {',
    "    // `_playground/*.spec.ts` and not `**`: a template's playground holds a stranger's",
    "    // repository, and nothing in it is this package's test.",
    "    include: ['src/**/*.spec.ts', '_playground/*.spec.ts'],",
    "    environment: 'node',",
    '    coverage: {',
    "      provider: 'v8',",
    "      include: ['src/**/*.ts'],",
    '      // A spec and its helpers are the instrument, not the subject: counted, they',
    '      // report themselves as covered and lift the number that gates real code.',
    "      exclude: ['src/**/*.spec.ts', 'src/**/*.spec-helpers.ts'],",
    "      reporter: ['text-summary', 'json-summary'],",
    `      thresholds: ${thresholds},`,
    '    },',
    '  },',
    '});',
    '',
  ].join('\n');
}

// ── tsup.config.ts ──────────────────────────────────────────────────────────────────

/**
 * The build, as a bundler rather than as eighteen copies of an esbuild script.
 *
 * WHY A BUNDLER AT ALL, and not `tsc`: `tsc` emits relative specifiers exactly as
 * written — without extensions — and node's ESM loader cannot resolve them. The choice
 * was between rewriting every import in every source and letting a bundler do it.
 *
 * WHY `tsup` AND NOT THE HAND-ROLLED SCRIPT IT REPLACES: seventeen of the eighteen build
 * scripts were byte-identical copies, and the eighteenth had drifted. Each one invoked
 * esbuild, then spawned `tsc` for declarations through a path it computed itself, and
 * carried a paragraph explaining why it could not simply call `pnpm exec tsc` on
 * Windows. All of that is what a bundler already does.
 *
 * `target` is the node floor, and it is not decoration: esbuild lowers SYNTAX, never
 * library surface, so a target below the oldest runtime whose APIs the sources call
 * compiles clean and throws on import. It said `node20` once while the file source
 * imported `fs.globSync`, and every run on a node-20 shell died with a bare "does not
 * provide an export named 'globSync'" rather than a version complaint.
 *
 * GENERATED from `scripts/registry.mjs`. Edit the registry.
 */
function tsupConfig(pkg) {
  const stamp = pkg.kind === 'core';
  return `import { defineConfig } from 'tsup';
${stamp ? "\nimport { stampFingerprint } from './scripts/src-fingerprint.mjs';\n" : ''}
/**
 * Package build: one ESM bundle plus its \`.d.ts\`.
 *
 * A BUNDLER rather than \`tsc\`, because \`tsc\` emits relative specifiers as written —
 * without extensions — and node's ESM loader cannot resolve them.
 *
 * \`target\` is the node floor and must never sit below the oldest runtime whose APIs the
 * sources actually call: esbuild lowers syntax, not library surface, so a lower target
 * compiles clean and then throws on import.
 *${
   stamp
     ? `
 * \`onSuccess\` stamps the source fingerprint beside the bundle. The CLI shim compares it
 * to a live fingerprint of \`src\` to tell "built from this source" from "stale" — by
 * CONTENT, so it survives a checkout or a cache restore where mtimes lie. Without the
 * stamp every run refuses with "dist is stale", which is how this was found.
 *`
     : ''
 }
 * GENERATED from \`scripts/registry.mjs\`. Edit the registry.
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
  skipNodeModulesBundle: true,${stamp ? '\n  onSuccess: stampFingerprint,' : ''}
});
`;
}

// ── README.md ───────────────────────────────────────────────────────────────────────

function readme(pkg) {
  const kind = KINDS[pkg.kind];
  const name = pkgName(pkg);
  const deps = pkgDeps(pkg);

  return `# ${name}

${kind.badge} **${kind.label}** — ${pkg.description}

${pkg.summary}

## What a ${kind.label} is

${kind.rule}

## Install

\`\`\`bash
npm install ${name}${pkg.kind === 'core' ? '' : ' specwarden'}
\`\`\`
${
  deps.length
    ? `
It depends on ${deps.map((d) => `[\`${d}\`](${ORIGIN.repository}/tree/main/${pkgDir(byName(d))}#readme)`).join(', ')}.
`
    : ''
}
## Documentation

- [What specwarden is](${ORIGIN.repository}#readme) — the failure it exists against
- [ARCHITECTURE.md](${ORIGIN.repository}/blob/main/ARCHITECTURE.md) — how the packages divide the work
- [CONTRIBUTING.md](${ORIGIN.repository}/blob/main/CONTRIBUTING.md) — running the repository, and how a release is cut

<!-- GENERATED from scripts/registry.mjs. Edit the registry, then run \`pnpm scaffold\`. -->
`;
}

// ── LICENSE ─────────────────────────────────────────────────────────────────────────

/**
 * The licence text, copied into every package.
 *
 * A copy per package rather than one at the root, because a tarball carries only what
 * `files` lists: a consumer who installs one package from npm and looks for its terms
 * finds the root of a repository they do not have.
 */
const LICENSE = `MIT License

Copyright (c) ${ORIGIN.since} ${ORIGIN.owner}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

// ── the root README's package table ─────────────────────────────────────────────────

/** The table is generated so a new package appears in it by existing, not by being
 * remembered. Delimited by markers so the prose around it stays hand-written. */
export const PACKAGE_TABLE_START = '<!-- PACKAGES:START -->';
export const PACKAGE_TABLE_END = '<!-- PACKAGES:END -->';

export function packageTable() {
  const rows = PACKAGES.map(
    (p) => `| ${KINDS[p.kind].badge} \`${pkgName(p)}\` | ${KINDS[p.kind].label} | ${p.description} |`,
  );
  return [
    PACKAGE_TABLE_START,
    '',
    '| Package | Kind | What it is |',
    '| --- | --- | --- |',
    ...rows,
    '',
    PACKAGE_TABLE_END,
  ].join('\n');
}

/** Replace the marked block in a document, leaving everything around it alone. */
export function withPackageTable(markdown) {
  const start = markdown.indexOf(PACKAGE_TABLE_START);
  const end = markdown.indexOf(PACKAGE_TABLE_END);
  if (start === -1 || end === -1) return markdown;
  return markdown.slice(0, start) + packageTable() + markdown.slice(end + PACKAGE_TABLE_END.length);
}

// ── what this script writes ─────────────────────────────────────────────────────────

/** Every file the scaffolder owns, as path → contents. Exported so the drift check can
 * compare without writing — two readings of one source would be one too many. */
export function generated() {
  const out = new Map();
  for (const pkg of PACKAGES) {
    const dir = pkgDir(pkg);
    out.set(`${dir}/package.json`, manifest(pkg));
    out.set(`${dir}/tsconfig.json`, tsconfigFor(pkg));
    out.set(`${dir}/vitest.config.ts`, vitestConfig(pkg));
    out.set(`${dir}/tsup.config.ts`, tsupConfig(pkg));
    out.set(`${dir}/README.md`, readme(pkg));
    out.set(`${dir}/LICENSE`, LICENSE);
  }
  out.set('LICENSE', LICENSE);
  // The skill layer: plugin manifests, the copied reference, the marketplace. Merged
  // into one map so the drift check has ONE thing to compare and cannot audit half of
  // what the scaffolder writes.
  for (const [rel, text] of generatedSkillFiles()) out.set(rel, text);
  // The index a model is handed. It was generated by a function nothing called, so the
  // committed copy had already drifted from it — a missing guide, a stale description —
  // the day it was first compared. In this map, `scaffold-drift` compares it like the rest.
  out.set('llms.txt', generateLlmsIndex());
  return out;
}

function main() {
  const files = generated();
  for (const [rel, text] of files) write(rel, text);

  // The root README's table, in place.
  const readmePath = join(ROOT, 'README.md');
  const before = readFileSync(readmePath, 'utf8');
  const after = withPackageTable(before);
  if (after !== before) writeFileSync(readmePath, after, 'utf8');

  /**
   * What the scaffolder DELETES.
   *
   * Both are files eighteen packages carried a near-identical copy of, and both now
   * live once: the build is `tsup.config.ts` generated above, and the lint config is
   * the workspace's single `eslint.config.mjs`. Removed here rather than by hand so a
   * package that grows one back is cleaned on the next run instead of quietly taking
   * precedence over the shared one.
   *
   * The engine keeps its `scripts/` — the CLI shim and its fingerprint helper are
   * deliberately build-free and are published.
   */
  for (const pkg of PACKAGES) {
    rmSync(join(ROOT, pkgDir(pkg), 'eslint.config.mjs'), { force: true });
    rmSync(join(ROOT, pkgDir(pkg), 'scripts', 'build.mjs'), { force: true });
    if (pkg.kind === 'core') continue;
    rmSync(join(ROOT, pkgDir(pkg), 'scripts'), { force: true, recursive: true });
  }

  process.stdout.write(`scaffolded ${files.size} file(s) across ${PACKAGES.length} package(s)\n`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('scaffold.mjs')) main();
