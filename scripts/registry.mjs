/**
 * Every package of the monorepo, one entry each.
 *
 * This is the single source: each package's `package.json`, `tsconfig.json`,
 * `tsup.config.ts`, `README.md` and `LICENSE` are generated from it, as is the
 * package table in the root README. Edit HERE, never the output —
 * `pnpm check:drift` fails when the two disagree.
 *
 * WHY A REGISTRY AND NOT EIGHTEEN PAIRS OF HANDS. Measured on the day this file was
 * written: seventeen of the eighteen build scripts were byte-identical copies of each
 * other, `@types/node` was pinned at `^22` in one package and `^24` in the other
 * seventeen while the engines field demanded 24, and not one package carried a licence.
 * None of that is a mistake anybody made; it is what hand-maintained duplication does on
 * its own. A derived file cannot drift from its source, and the only way to keep that
 * true is for there to be one source.
 *
 * `kind` decides the rest: the npm name, the directory, the dependency on the engine,
 * and how the package is described.
 */

/**
 * Where this repository lives, and under whose name it publishes.
 *
 * ONE declaration, because it reaches five generated places: every package's
 * `repository` and `homepage`, every plugin manifest, the plugin marketplace, and the
 * provenance line in every shipped skill. Written in five files by hand it would be
 * wrong in one of them within a month.
 */
export const ORIGIN = Object.freeze({
  owner: 'specwarden',
  repository: 'https://github.com/specwarden/specwarden',
  /** What `/plugin marketplace add` takes: the repository, without the host. */
  marketplace: 'specwarden/specwarden',
  license: 'MIT',
  /** The year the licence is dated from. */
  since: 2026,
});

/**
 * The toolchain every package shares, declared once.
 *
 * A version range repeated in eighteen manifests is eighteen chances to disagree, and
 * they already had: `@types/node` said `^22.10.7` in the engine and `^24.0.0` in every
 * other package, against an `engines` field requiring node 24. Nothing failed, because
 * nothing compared them.
 */
export const TOOLCHAIN = Object.freeze({
  /**
   * The oldest Node a PUBLISHED package runs on: every package's `engines`, the build
   * target (`buildTarget` below), and the floor the CLI shim refuses beneath. Developing
   * here takes Node 24 — the root manifest says so, and vitest 4 and Stryker need 20 at
   * least — but a consumer should not have to run the Node this repository is built with.
   *
   * 18.18.0 and not 18.0.0: `node --test` arrived in 18.1 and `--test-reporter` in 18.15,
   * and what `new` prints and the guides show runs a check's test with both. It is the
   * floor ESLint 9 and typescript-eslint already set, so a repository linting on 18 is
   * already past it. The one runtime API the engine needed from later Nodes was
   * `fs.globSync`; it walks trees itself now (`core/src/infrastructure/_shared/glob-walk/`).
   */
  node: '>=18.18.0',
  packageManager: 'pnpm@10.18.3',
  devDependencies: Object.freeze({
    '@types/node': '^24.0.0',
    // The coverage provider `test:coverage` names. It was absent from every manifest while
    // every manifest carried the script, so the ratchet this repository describes could
    // not run at all: `vitest run --coverage` died with MISSING DEPENDENCY in each package.
    '@vitest/coverage-v8': '^4.0.0',
    tsup: '^8.5.0',
    typescript: '^5.9.0',
    vitest: '^4.0.0',
  }),
});

/** esbuild's name for the floor — `>=18.18.0` builds for `node18.18` — derived, so the two cannot disagree. */
export const buildTarget = () => `node${TOOLCHAIN.node.replace(/^>=/, '').split('.').slice(0, 2).join('.')}`;

/**
 * THE NAMING SCHEME. The engine is unscoped — `specwarden` is the thing you install and
 * the command you run — and everything else lives under the `@specwarden/` scope. That
 * split is not cosmetic: an unscoped name is a claim on a word in a global namespace, and
 * one product should make exactly one such claim. A scope also makes the boundary visible
 * in an import: `specwarden` is the engine, `@specwarden/anything` is an opinion the
 * repository chose.
 *
 * The kind stays in the name for a plugin and a template (`@specwarden/plugin-nestjs`)
 * and drops out for a module (`@specwarden/docs`), because a module is the common case
 * and a name reading `@specwarden/module-docs` says "module" twice.
 *
 * What a package IS, relative to the engine. Four answers, and the boundary between
 * them is the product's central rule: **if a check could be WRONG about a repository
 * that has never heard of it, it is an opinion and it ships as a module.**
 *
 * That line is not theoretical. The engine once held nineteen checks and every consumer
 * inherited all nineteen — five vendor credential formats it might not use, an English
 * hedging vocabulary, a TypeScript declaration grammar. None of it was wrong; all of it
 * was somebody else's opinion arriving unasked.
 */
export const KINDS = Object.freeze({
  core: {
    label: 'core',
    dir: 'core',
    naming: (slug) => slug,
    badge: '◆',
    rule: 'One, unscoped. Everything depends on it; it depends on nothing, and it knows no repository.',
  },
  module: {
    label: 'module',
    dir: 'modules',
    naming: (slug) => `@specwarden/${slug}`,
    badge: '▸',
    rule: 'An opinion a repository chooses. It could be wrong about a repository that has never heard of it, which is exactly why it is not in the engine.',
  },
  plugin: {
    label: 'plugin',
    dir: 'plugins',
    naming: (slug) => `@specwarden/plugin-${slug}`,
    badge: '⬡',
    rule: "One stack's conventions, declared against the engine's primitives. Wired from the consumer's config; it never supplies a port adapter.",
  },
  template: {
    label: 'template',
    dir: 'templates',
    naming: (slug) => `@specwarden/template-${slug}`,
    badge: '⚒',
    rule: 'A starting tree for one kind of repository, so day one is one command rather than a blank file. It emits ordinary files the repository then owns.',
  },
  scaffold: {
    label: 'scaffold',
    dir: 'templates',
    naming: () => '@specwarden/scaffold-parts',
    badge: '⚙',
    rule: 'The pieces a template is assembled from — one check, the rule it enforces, the config field that makes the two resolve. A build-time dependency of the templates and of nothing else.',
  },
});

/**
 * Every package, in the order the root README lists them.
 *
 * `deps` names workspace siblings only. The engine is added automatically to every
 * kind but `core`, because a module that does not depend on the engine is not a
 * module — and a dependency that is implied by the kind is one nobody can forget.
 */
export const PACKAGES = Object.freeze([
  {
    slug: 'specwarden',
    kind: 'core',
    // The one package whose directory is not `<bucket>/<slug>`: it IS the bucket. Stated
    // rather than special-cased in `pkgDir`, so every reader of a package's location
    // reads it from the same field.
    dir: 'core',
    description: 'A repository declares its rules; specwarden proves which hold.',
    summary:
      'Ports, primitives, the runner and the CLI, plus the self-checks, which audit the declarations: zones, ratchets and the rule register.',
    deps: [],
    coverage: { statements: 99, branches: 97, functions: 98, lines: 99, measured: '2026-09-23' },
    /** The CLI. A build-free ESM shim that runs the compiled engine and refuses a stale one. */
    bin: { specwarden: './bin/specwarden.mjs', spw: './bin/specwarden.mjs' },
    /** Shipped beside `dist` because the shim and its fingerprint are not compiled. */
    extraFiles: ['bin', 'scripts'],
    /** Mutation testing belongs to the engine alone: a P-zone check's behaviour is public
     * API, so the cost of an unnoticed break is higher there than anywhere else. */
    extraScripts: { 'test:watch': 'vitest', 'test:mutation': 'stryker run' },
    extraDevDependencies: {
      '@stryker-mutator/core': '^9.6.1',
      '@stryker-mutator/vitest-runner': '^9.6.1',
    },
    skill: {
      name: 'specwarden',
      description: 'Write, run and reason about checks with specwarden.',
    },
  },

  {
    slug: 'docs',
    kind: 'module',
    skill: {
      name: 'specwarden-docs',
      description: 'Configure and reason about documentation checks — paths, symbols, counts, placement, hygiene.',
    },
    description: 'Documentation checks: paths, symbols, counts, placement, hygiene.',
    summary:
      'Every path a document names resolves, every symbol it cites exists, and no count is restated where the repository already owns it.',
    deps: [],
    coverage: { statements: 98, branches: 96, functions: 99, lines: 99, measured: '2026-09-23' },
  },
  {
    slug: 'plans',
    kind: 'module',
    skill: {
      name: 'specwarden-plans',
      description: 'Configure the plan lifecycle and the decision log a plan carries.',
    },
    description: 'Plans and decision logs — one way of working, not the only one.',
    summary:
      'A plan names its acceptance commands, a rejected alternative carries its reason, and a finished plan leaves the live corpus.',
    deps: [],
    coverage: { statements: 99, branches: 98, functions: 99, lines: 99, measured: '2026-09-23' },
  },
  {
    slug: 'ops',
    kind: 'module',
    skill: {
      name: 'specwarden-ops',
      description: 'Configure the operational checks — env files, upstreams, CI coverage, build order, shell scoping.',
    },
    description: 'Env files, proxy upstreams, CI coverage, build order, shell scoping.',
    summary:
      'The operational seams: every heavy gate has a CI job, every env file agrees with its siblings, and a Dockerfile builds its dependencies first.',
    deps: [],
    coverage: { statements: 98, branches: 96, functions: 99, lines: 99, measured: '2026-09-23' },
  },
  {
    slug: 'security',
    kind: 'module',
    skill: {
      name: 'specwarden-security',
      description: 'Configure the credential scan, its allowlist and its ratchet.',
    },
    description: 'Credential scanning, with a vendor library as a preset rather than a mandate.',
    summary:
      'No credential-shaped string reaches the repository — and the allowlist is for the file that necessarily contains the patterns the scan looks for.',
    deps: [],
    coverage: { statements: 99, branches: 99, functions: 99, lines: 99, measured: '2026-09-23' },
  },
  {
    slug: 'agents',
    kind: 'module',
    skill: {
      name: 'specwarden-agents',
      description: 'Configure the agent-definition check for a repository coding agents work in.',
    },
    description: 'Coding-agent role definitions.',
    summary:
      'Every agent declares its name, description, tools and model; its name matches its file; and only an orchestrator may spawn another.',
    deps: [],
    coverage: { statements: 99, branches: 99, functions: 99, lines: 99, measured: '2026-09-23' },
  },
  {
    slug: 'openspec',
    kind: 'module',
    skill: { name: 'specwarden-openspec', description: 'Wire an OpenSpec tree as the requirement source.' },
    description: 'Reads an OpenSpec tree as the source of requirements.',
    summary:
      'The spec seam, one side of it: requirements and tasks come from OpenSpec, and the engine reconciles them against the invariants already deposited.',
    deps: [],
    coverage: { statements: 99, branches: 99, functions: 99, lines: 99, measured: '2026-09-23' },
  },
  {
    slug: 'speckit',
    kind: 'module',
    skill: { name: 'specwarden-speckit', description: 'Wire a Spec Kit tree as the requirement source.' },
    description: 'Reads a Spec Kit tree as the source of requirements.',
    summary:
      'The same seam as the OpenSpec module, against the other tool. A repository specified in either gets the reconciliation on day one.',
    deps: [],
    coverage: { statements: 99, branches: 99, functions: 99, lines: 99, measured: '2026-09-23' },
  },

  {
    slug: 'nestjs',
    kind: 'plugin',
    skill: { name: 'specwarden-nestjs', description: 'Wire the NestJS conventions plugin and read what it refuses.' },
    description: "NestJS conventions, declared against the engine's primitives.",
    summary:
      'Module decomposition and the database barrier: a module reaches persistence through a repository, never through a direct ORM import.',
    deps: [],
    coverage: { statements: 99, branches: 99, functions: 99, lines: 99, measured: '2026-09-23' },
  },

  {
    slug: '_parts',
    kind: 'scaffold',
    dir: 'templates/_parts',
    description: 'The pieces every template is assembled from.',
    /**
     * Every module, at TEST time only.
     *
     * A part emits a check file that imports the module implementing it, and this
     * package's own suite writes each part and then IMPORTS what it wrote — which is
     * the only way a template's output is ever type-checked, because a template emits
     * strings and no compiler reads a string. So the modules are needed to run the
     * tests and not to build, which is exactly what a dev dependency is.
     */
    devDeps: [
      '@specwarden/agents',
      '@specwarden/docs',
      '@specwarden/ops',
      '@specwarden/openspec',
      '@specwarden/plans',
      '@specwarden/security',
      '@specwarden/speckit',
    ],
    summary:
      'One piece a template is assembled from: the check or checks it writes, the rule they enforce, and where one is needed the config field that makes the two resolve.',
    deps: [],
    coverage: { statements: 99, branches: 99, functions: 99, lines: 99, measured: '2026-09-23' },
  },
  {
    slug: 'node-ts',
    kind: 'template',
    description: 'An ordinary TypeScript repository — credential scan, doc paths and symbols, lint and tests.',
    summary:
      'The smallest tree worth having on day one: a credential scan, documentation paths, a symbol check as an example, and the linter and test suite wrapped where the manifest already has them.',
    deps: ['@specwarden/scaffold-parts', '@specwarden/docs', '@specwarden/security'],
    coverage: { statements: 99, branches: 99, functions: 99, lines: 99, measured: '2026-09-23' },
  },
  {
    slug: 'docs-only',
    kind: 'template',
    description: 'A repository whose product is documentation — paths, hygiene, counts, placement.',
    summary: 'Every documentation check the docs module has, and nothing that assumes code.',
    deps: ['@specwarden/scaffold-parts', '@specwarden/docs'],
    coverage: { statements: 99, branches: 99, functions: 99, lines: 99, measured: '2026-09-23' },
  },
  {
    slug: 'monorepo',
    kind: 'template',
    description:
      'A pnpm workspace — lockfile, credential scan, documentation paths; build order, dependency pins and CI coverage as examples.',
    summary:
      'What a workspace can get wrong that a single package cannot: a stale lockfile, a Dockerfile that builds out of order, a heavy check with no CI job.',
    deps: ['@specwarden/scaffold-parts', '@specwarden/ops', '@specwarden/security', '@specwarden/docs'],
    coverage: { statements: 99, branches: 99, functions: 99, lines: 99, measured: '2026-09-23' },
  },
  {
    slug: 'nestjs',
    kind: 'template',
    description: 'A NestJS backend — module conventions via the plugin, credential scan, env pairing, migration guard.',
    summary: 'The module-decomposition plugin, the credential scan and the operational checks a service carries.',
    deps: ['@specwarden/scaffold-parts', '@specwarden/plugin-nestjs', '@specwarden/security', '@specwarden/ops'],
    coverage: { statements: 99, branches: 99, functions: 99, lines: 99, measured: '2026-09-23' },
  },
  {
    slug: 'agentic',
    kind: 'template',
    description:
      'A repository coding agents work in — role files, agent-read docs, plan and decision lifecycle, a perimeter.',
    summary:
      'The agent-facing half: role definitions that resolve, plans that die when finished, and a perimeter computed before the action rather than after it.',
    deps: ['@specwarden/scaffold-parts', '@specwarden/agents', '@specwarden/plans', '@specwarden/docs'],
    coverage: { statements: 99, branches: 99, functions: 99, lines: 99, measured: '2026-09-23' },
  },
  {
    slug: 'ops',
    kind: 'template',
    description:
      'Infrastructure — env pairing, proxy upstreams, shell scoping, runbooks — credential scan and documentation paths always on.',
    summary: 'For a repository whose product is the operation of something else.',
    deps: ['@specwarden/scaffold-parts', '@specwarden/security', '@specwarden/docs', '@specwarden/ops'],
    coverage: { statements: 99, branches: 99, functions: 99, lines: 99, measured: '2026-09-23' },
  },
  {
    slug: 'openspec',
    kind: 'template',
    description:
      'A repository specified with OpenSpec — the spec source wired, credential scan, doc paths, lint and tests.',
    summary: 'The requirement source declared, so `sync-invariants` has both halves on day one.',
    deps: ['@specwarden/scaffold-parts', '@specwarden/openspec', '@specwarden/security', '@specwarden/docs'],
    coverage: { statements: 99, branches: 99, functions: 99, lines: 99, measured: '2026-09-23' },
  },
  {
    slug: 'speckit',
    kind: 'template',
    description:
      'A repository specified with Spec Kit — the spec source wired, credential scan, doc paths, lint and tests.',
    summary: 'The same as the OpenSpec template, against the other tool.',
    deps: ['@specwarden/scaffold-parts', '@specwarden/speckit', '@specwarden/security', '@specwarden/docs'],
    coverage: { statements: 99, branches: 99, functions: 99, lines: 99, measured: '2026-09-23' },
  },
]);

/** The npm name a package publishes under. */
export const pkgName = (pkg) => KINDS[pkg.kind].naming(pkg.slug);

/** The directory it lives in, relative to the repository root. */
export const pkgDir = (pkg) => pkg.dir ?? `${KINDS[pkg.kind].dir}/${pkg.slug}`;

/**
 * Every workspace sibling it depends on at runtime.
 *
 * The engine is implied by the kind rather than listed per package: a module that does
 * not depend on the engine is not a module, and an implied dependency is one nobody can
 * forget to add.
 */
export const pkgDeps = (pkg) => (pkg.kind === 'core' ? [] : ['specwarden', ...pkg.deps]);

/** Look a package up by its npm name — what a dependency list holds. */
export const byName = (name) => PACKAGES.find((p) => pkgName(p) === name);
