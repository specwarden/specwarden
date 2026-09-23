/**
 * One lint configuration for the whole workspace.
 *
 * It replaces eighteen per-package copies — seventeen byte-identical, one drifted — each
 * banning imports from directories that do not exist in this repository, so the barrier
 * they enforced had quietly become a rule that could not fail. What it protected is real
 * and is restated below against the packages that actually exist.
 */
import eslint from '@eslint/js';
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
 * The engine depends on NOTHING, and that is the load-bearing rule of the whole
 * product.
 *
 * It is what makes the engine liftable: a repository installs `specwarden` and gets the
 * runner, the ports and the harness's own audits, with no opinion about documentation,
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
      // A template playground's repository is a stranger's code — a NestJS service that
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
    // The repository's own guard scripts. They are tools a person runs: printing IS
    // their output, and they are plain ESM rather than a typed package.
    files: ['scripts/**/*.mjs', 'core/scripts/**/*.mjs', 'core/bin/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: nodeGlobals },
    rules: { 'no-console': 'off' },
  },
);
