# @specwarden/plugin-nestjs — guide

NestJS conventions as a specwarden plugin. Today that is one check, `nestjs-db-access`.

## What it catches

**A module reaches the database only through a repository.** A direct ORM import inside a
service is a query written where nothing can see it: not in the repository layer that is
reviewed for query shape, and not where the next person looks. The rule is not a fact about
any particular project — it is the architecture NestJS pushes toward, so the query lives in
one layer and the module can be tested without one. Every NestJS codebase that draws that
line wants the same check; only where the modules sit and what the ORM is called differ.

## Wiring

```bash
pnpm add -D @specwarden/plugin-nestjs
```

```js
// .specwarden/config.mjs
import { nestjs } from '@specwarden/plugin-nestjs';
import { defineConfig } from 'specwarden';

export default defineConfig({
  plugins: [nestjs({ modulesDir: 'src/modules', ormPackage: 'drizzle-orm' })],
});
```

A plugin is not imported as a check. The engine takes its checks out of it, registers them
alongside the rest, and they are named on the command line like any other:

```bash
specwarden check --id nestjs-db-access
```

The check carries the rule the package implies — "a module reaches the database only
through a repository", owned by `@specwarden/plugin-nestjs` — so it is no orphan in a
repository that keeps a rule register. Write `rule` to say it in your own words and point
at the document that holds your reasoning; the finding's hint then names that document:

```js
import { nestjs } from '@specwarden/plugin-nestjs';
import { defineConfig } from 'specwarden';

export default defineConfig({
  plugins: [
    nestjs({
      modulesDir: 'src/modules',
      ormPackage: 'drizzle-orm',
      rule: { statement: 'a module reaches the database only through a repository', owner: 'docs/ARCHITECTURE.md' },
    }),
  ],
});
```

## Options

| Option       | Kind                   | Default                                                                                           |
| ------------ | ---------------------- | ------------------------------------------------------------------------------------------------- |
| `modulesDir` | directory              | — required                                                                                        |
| `ormPackage` | package name           | — required                                                                                        |
| `except`     | git pathspecs left out | `DEFAULT_NESTJS_EXCEPT`: `**/repositories/**`, `**/entities/**`, `**/*.entity.ts`, `**/*.spec.ts` |
| `corpus`     | `{ atLeast, why }`     | `{ atLeast: 1 }`                                                                                  |

Beside these it takes the declaration any module check takes — `id` (default
`nestjs-db-access`), `title`, `tier` (default `fast`), `when`, `hint`, `advisory`, `rule`,
`ratchet` — and refuses an option it does not have, an empty `modulesDir` or `ormPackage`,
and `zone`, by name, when the config loads.

`except` is what makes the rule livable: the repository layer is where the query belongs,
an entity IS the ORM's schema — a TypeORM or Drizzle entity cannot be written without
importing it — and the tests that exercise them necessarily reach the same package. When
given, it replaces the list; start from `DEFAULT_NESTJS_EXCEPT`, which is exported. The ban
reads only `<modulesDir>/**`, so `**/repositories/**` already means the repositories among
the modules.

## What fails and what passes

- **A module file importing `ormPackage`** — or a path under it, `drizzle-orm/pg-core` —
  fails, one finding per import with its file and line.
- **A `modulesDir` that matches no tracked file fails** on the corpus floor, naming the
  pathspec: the modules moved, and a ban over nothing bans nothing. `corpus: { atLeast: 0 }`
  says an empty set is expected.
- **A clean pass says what it read**: `✓ nestjs-db-access — 214 file(s) examined, clean`.
- **The ratchet is yours.** The plugin ships no number — a debt count belongs to the tree
  that has the debt. Arm it at today's count with `ratchet: n`: the run passes over the
  debt it already has, names it as tolerated, and fails on the next violation. As the debt
  is paid, `specwarden check --tighten` records the lower count. It never records a count
  the check FAILED at — a red run is not a threshold.

```js
import { nestjs } from '@specwarden/plugin-nestjs';
import { defineConfig } from 'specwarden';

export default defineConfig({
  plugins: [nestjs({ modulesDir: 'src/modules', ormPackage: 'drizzle-orm', ratchet: 1 })],
});
```

A plugin **declares checks** and never supplies a port adapter — the loader refuses one —
because a plugin that could reach the filesystem itself would be a way around the
capability gating that makes a check safe to install at all.
