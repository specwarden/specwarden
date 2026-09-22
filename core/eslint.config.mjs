/**
 * Zone P — the import barrier, enforced by the compiler rather than by a
 * convention. `packages/specwarden` is the PRODUCT zone: it must not reach
 * outside its own package. Not a host workspace (`be/`, `fe/`, …), not a shared
 * `@app/*` package, not an FE/BE path alias. The direction of the whole product
 * rests on this: P knows `Check`, `Rule`, `DocKind`; it never knows `gap`,
 * `be/`, or `drizzle`.
 *
 * This is deliberately NOT `packages/eslint.config.base.mjs`. That base is the
 * `@app/*` floor-of-the-graph barrier — it permits an `@app/*` sibling import
 * (contracts depends on i18n). Zone P is stricter: it depends on NO repository
 * package at all, because it is a product to be extracted, and a dependency on
 * `@app/i18n` would leave the day it moves out.
 *
 * The mechanism is the one `be/` uses for its own database-access barrier, and
 * the phrase there is the philosophy of this product entire: the rule is the
 * compiler, not a convention. Two more enforcements sit beside this one and
 * catch what an import ban cannot: the zone spec beside the zone model sweeps every
 * source for host-repository literals, and each check carries its zone as DATA on the
 * object it produces, so the registry can refuse one whose zone contradicts where it
 * came from.
 */
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * The three shapes an "outside the package" import takes here. A relative escape
 * that resolves above the package root (`../../../be/...`) is caught by its
 * host-workspace segment; the literal sweep in `zone.spec.ts` is the backstop
 * for anything a regex over specifiers cannot see.
 */
export const OUTSIDE_ZONE_P = [
  {
    regex: '(^|/)(be|fe|landing_mkt|outreach-console)/',
    caseSensitive: true,
    message:
      'Zone P (packages/specwarden) must not import a host workspace. specwarden is a product with a single consumer today and no knowledge of it — the value a host needs is declared in .specwarden/, never imported into the engine.',
  },
  {
    regex: '^@app/',
    caseSensitive: true,
    message:
      'Zone P must not import a shared @app/* package. The engine depends on no repository package — it is extracted the day a second consumer exists, and an @app/i18n import would break that move. Inline what you need.',
  },
  {
    regex: '^@(Core|Modules|App|ViewModels|Gateways|core|modules|shared|infrastructure|persistence)/',
    caseSensitive: true,
    message:
      'That is an FE/BE path alias. Zone P knows no host application — see the two-zone rule in packages/specwarden/core/README.md.',
  },
];

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      // Stated explicitly because this folder holds MORE THAN ONE package: with core/ and
      // plugins/* both carrying a tsconfig, a single eslint invocation over files from both
      // (which lint-staged does) has two candidate roots and refuses to guess.
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
      // The engine writes to a host's console only through the IReporter port and
      // its adapters, never inline: it cannot know whether it runs under a TTY, in
      // CI, or piped to a file. Adapters relax this in their own scope when they land.
      'no-console': 'error',
      'no-restricted-imports': ['error', { patterns: OUTSIDE_ZONE_P }],
    },
  },
  {
    // Specs are excluded from tsconfig (they must not reach dist), so tsc does not
    // check them; allow the shapes a fixture-driven spec needs. They still obey the
    // import barrier — a spec that reached into `be/` would defeat the point.
    files: ['src/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
);
