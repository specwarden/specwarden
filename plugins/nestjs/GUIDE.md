# @specwarden/plugin-nestjs — guide

NestJS conventions as a specwarden plugin. Today that is one rule: a module reaches the
database through a repository.

## Why a package rather than a check in one repository's config

The rule is not a fact about any particular project — it is a fact about the architecture
NestJS pushes toward. A module reaches the database through a repository, so the query
lives in one layer and the module can be tested without one. Every NestJS codebase that
draws that line wants the same check, and the only things that differ between them are
where their modules sit and what their ORM is called.

## Install and wire

```bash
pnpm add -D @specwarden/plugin-nestjs
```

```js
// .specwarden/warden.config.mjs
import { nestjs } from '@specwarden/plugin-nestjs';
import { defineConfig } from 'specwarden';

export default defineConfig({
  plugins: [
    nestjs({
      modulesRoot: 'src/modules',
      ormPackage: 'drizzle-orm',
      ruleDocument: 'docs/ARCHITECTURE.md',
    }),
  ],
});
```

A plugin is not imported as a check. The engine takes its checks out of it, registers
them alongside the inline ones, and they are named on the command line like any other:

```bash
specwarden check --id nestjs/db-access-through-repositories
```

## Options

| Option                  | What it is                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `modulesRoot`           | where the modules live, repository-relative                                                            |
| `ormPackage`            | the ORM (or any data-access package) a module may not import directly                                  |
| `allowedFrom`           | glob suffixes under `modulesRoot` that MAY import it. Default: `**/repositories/**` and `**/*.spec.ts` |
| `ratchetId` / `ratchet` | for a tree that has existing violations. Omit both in a clean tree                                     |
| `ruleDocument`          | where the host writes the rule down; named in the finding so a reader can go there                     |

The default exemptions are what make the rule livable: the repository layer is where the
query belongs, and the tests that exercise it necessarily reach the same package.

## The ratchet is YOURS

The plugin ships no number. A debt count belongs to the tree that has the debt; the
plugin takes an id and the host owns the file behind it. A plugin shipping a number would
be asserting something about a repository it has never seen.

```js
nestjs({ modulesRoot: 'src/modules', ormPackage: 'drizzle-orm', ratchetId: 'nestjs-db-access' });
```

Then `specwarden check --tighten` records today's count, and the next violation fails.

## What a plugin may and may not do

It **declares checks**. It never supplies a port adapter — the loader refuses one —
because a plugin that could reach the filesystem itself would be a way around the
capability gating that makes a check safe to install at all. Everything here is built
from the engine's declarative primitives, so the plugin carries no I/O of its own.

## Adding a second rule

A sibling folder under `src/`, exported from the barrel, added to the `checks` array. The
barrel stays the only file a consumer's import path depends on, so a second NestJS rule
is a new folder rather than a longer index.
