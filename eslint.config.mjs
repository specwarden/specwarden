/**
 * One lint configuration for the whole workspace.
 *
 * It replaces eighteen per-package copies — seventeen byte-identical, one drifted — each
 * banning imports from directories that do not exist in this repository, so the barrier
 * they enforced had quietly become a rule that could not fail. What it protected is real
 * and is restated below against the packages that actually exist.
 */
import eslint from '@eslint/js';
import nodePlugin from 'eslint-plugin-n';
import tseslint from 'typescript-eslint';

/**
 * What a plain `.mjs` script may reach for.
 *
 * The typed packages get these from `@types/node` through their tsconfig; the guard
 * scripts are not a typed package, so without this every `process.exit` in them reads as
 * an undefined global. Declared rather than pulled from the `globals` package: it is
 * four names, and a dependency for four names is a dependency to keep current.
 */
const nodeGlobals = { process: 'readonly', console: 'readonly', URL: 'readonly', Buffer: 'readonly' };

/**
 * Everything a consumer's Node executes: each package's sources, and the engine's two
 * uncompiled directories — the CLI shim and the fingerprint helper it imports.
 */
export const SHIPPED = [
  'core/src/**/*.ts',
  'core/src/**/*.mjs',
  'core/bin/*.mjs',
  'core/scripts/*.mjs',
  'modules/*/src/**/*.ts',
  'plugins/*/src/**/*.ts',
  'templates/*/src/**/*.ts',
];

/**
 * The engine depends on NOTHING, and that is the load-bearing rule of the whole
 * product.
 *
 * It is what makes the engine liftable: a repository installs `specwarden` and gets the
 * runner, the ports and the self-checks, with no opinion about documentation,
 * plans or credentials arriving unasked. The day `core` imports a module, "the engine
 * knows no repository" stops being true and nothing but this line would notice — the
 * import would resolve, the tests would pass, and the coupling would only show up as a
 * consumer wondering why installing the engine installed a documentation checker.
 *
 * The direction is one-way and total: modules, plugins and templates import the engine;
 * the engine imports none of them.
 *
 * The pattern said `^specwarden-` until 2026-09-23 — a prefix no package here carries,
 * since every package but the engine lives under the `@specwarden/` scope. Nothing was ever called that after
 * the move, so for as long as it said so the rule everything rests on could not fail: an
 * `import { docPaths } from '@specwarden/docs'` in `core/src` linted clean, exit 0.
 * `scripts/eslint-config.test.mjs` now lints exactly that line and expects the refusal.
 */
export const ENGINE_IMPORTS_NOTHING = [
  {
    regex: '^@specwarden/',
    caseSensitive: true,
    message:
      'The engine must not import a module, a plugin or a template. Everything depends on core; core depends on nothing, which is what lets a consumer install it without inheriting anybody’s opinions. If core needs this, it is not a module.',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.tmp-generated-*/**',
      '**/coverage/**',
      // A template playground's repository is a consumer's code — a NestJS service that
      // imports an ORM nobody here installs, on purpose. Its style is not ours to lint, and
      // its `.specwarden/` is generated and compared byte for byte.
      '**/_playground/repository/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      // Stated explicitly because the workspace holds eighteen packages: a single
      // invocation over files from two of them has two candidate roots and refuses to
      // guess.
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      /**
       * Nothing writes to a host's console inline.
       *
       * A check returns a verdict and a reporter renders it, because the engine cannot
       * know whether it is running under a TTY, in CI, or piped into a file that some
       * other tool parses. An inline `console.log` is output that no reporter can
       * suppress, reformat, or turn into a CI annotation — and the reporters are the one
       * place allowed to relax this, in their own scope.
       */
      'no-console': 'error',
    },
  },

  {
    // The reporters ARE the output. They are the scope the rule above exists to funnel
    // everything else through, so it does not apply to them.
    files: ['core/src/infrastructure/*-reporter/**/*.ts', 'core/src/infrastructure/reporter-sink/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  {
    // Specs are excluded from every tsconfig — they must not reach `dist` — so `tsc`
    // does not check them; allow the shapes a fixture-driven spec needs.
    files: ['**/src/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  {
    /**
     * The barrier, over EVERYTHING under `core/` — sources, specs, the playground, the
     * CLI shim — and declared LAST so no relaxation above can switch it off.
     *
     * The spec override above used to set `no-restricted-imports: 'off'` under a comment
     * saying specs "still obey the import barrier". A core spec importing a module would
     * have coupled the engine's own proof to an opinion, and nothing would have said so.
     */
    files: ['core/**/*.ts', 'core/**/*.mjs'],
    rules: { 'no-restricted-imports': ['error', { patterns: ENGINE_IMPORTS_NOTHING }] },
  },

  {
    /**
     * What ships runs on the oldest Node its package DECLARES — `engines`, from the
     * registry's `TOOLCHAIN.node` — not on the Node this repository is built with.
     *
     * Neither of the other two tools can see the difference. `@types/node` describes the
     * newest Node, so `fs.globSync` typechecks; esbuild lowers syntax and never library
     * surface, so it builds. The engine imported `globSync` (Node 22) under a floor that
     * said 24, and on Node 18 and 20 it died on import. These rules read each file's own
     * `package.json`, so a module's source is held to the module's floor. The prototype
     * methods they cannot see — `toSorted` needs a type to be found — are `lib: ES2022`'s,
     * in `tsconfig.base.json`; what no static rule reaches is run on the floor itself by
     * `core/_playground/runtime.test.mjs`.
     */
    files: [...SHIPPED, 'core/_playground/*.mjs'],
    ignores: ['**/*.spec.ts'],
    plugins: { n: nodePlugin },
    rules: {
      'n/no-unsupported-features/node-builtins': 'error',
      'n/no-unsupported-features/es-builtins': 'error',
    },
  },

  {
    // The repository's own guard scripts. They are tools a person runs: printing IS
    // their output, and they are plain ESM rather than a typed package. The glob golden
    // set's helpers and its runner are the same kind of file, read on every Node.
    files: [
      'scripts/**/*.mjs',
      'core/scripts/**/*.mjs',
      'core/bin/*.mjs',
      'core/src/**/*.mjs',
      'core/_playground/*.mjs',
    ],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: nodeGlobals },
    rules: { 'no-console': 'off' },
  },
);
