---
name: specwarden-nestjs
description: Use when wiring specwarden into a NestJS backend — the module-decomposition conventions and the barrier that keeps a module out of the database.
---

# specwarden-nestjs

`@specwarden/plugin-nestjs`

```js
// .specwarden/warden.config.mjs
import { nestjs } from '@specwarden/plugin-nestjs';
import { defineConfig } from 'specwarden';

export default defineConfig({
  plugins: [
    nestjs({
      modulesRoot: 'src/modules',
      ormPackage: 'drizzle-orm',
      ratchetId: 'nestjs-db-access',
      ratchet: 3,
      ruleDocument: 'docs/module-decomposition.md',
    }),
  ],
});
```

## What it enforces

**A module reaches the database only through a repository.** A direct ORM import inside a
service is a query written where nothing can see it: not in the repository layer that is
reviewed for query shape, not in the place the next person looks, and not anywhere a
migration author would think to check.

## What you supply, and why the plugin cannot

- **`modulesRoot`** — where your modules live. There is no universal answer.
- **`ormPackage`** — which ORM. The plugin knows the SHAPE of the rule, never the vendor.
- **`ratchet`** — how many direct imports exist today. A plugin shipping a number would
  be asserting something about your codebase it cannot know.
- **`ruleDocument`** — the document that owns the reasoning, so a finding points at a
  page rather than at a plugin.
- **`rule`** — in a repository with a rule register, the rule this check enforces, so the
  register's orphan audit does not name it.

The repository layer, the entities (`**/entities/**`, `**/*.entity.ts`) and the specs may
import the ORM by default — an entity is the ORM's schema. Name `allowedFrom` only to
change that list, and never to exempt a service.

## Arm it at reality, then walk it down

A repository with existing direct imports sets the ratchet to that count. The check passes
today, fails on any increase, and the number goes down as the debt is paid. Setting it to
0 on a tree that cannot satisfy it makes the check red on day one, and a check that is red
for something nobody is about to fix is a check somebody turns off.

## Refuse to

- raise the ratchet to accommodate a new direct import;
- treat the plugin's conventions as the whole of a backend's rules. It knows one stack's
  shape, not your domain — the rest is yours to declare.
