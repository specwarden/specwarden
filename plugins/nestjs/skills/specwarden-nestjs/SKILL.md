---
name: specwarden-nestjs
description: Use when wiring specwarden into a NestJS backend — the module-decomposition conventions and the barrier that keeps a module out of the database.
---

# specwarden-nestjs

`@specwarden/plugin-nestjs`

## When to reach for it

A NestJS backend whose modules should reach the database only through a repository. A
direct ORM import inside a service is a query written where nothing can see it: not in the
repository layer that is reviewed for query shape, not in the place the next person looks,
and not anywhere a migration author would think to check.

## The wiring

```js
// .specwarden/config.mjs
import { nestjs } from '@specwarden/plugin-nestjs';
import { defineConfig } from 'specwarden';

export default defineConfig({
  plugins: [nestjs({ modulesDir: 'src/modules', ormPackage: 'drizzle-orm', ratchet: 3 })],
});
```

What you supply, and why the plugin cannot:

- **`modulesDir`** — where your modules live. There is no universal answer.
- **`ormPackage`** — which ORM. The plugin knows the SHAPE of the rule, never the vendor.
- **`ratchet`** — how many direct imports exist today. A plugin shipping a number would be
  asserting something about your codebase it cannot know. Arm it at reality, then walk it
  down: setting it to 0 on a tree that cannot satisfy it makes the check red on day one,
  and a check that is red for something nobody is about to fix is a check somebody turns off.
- **`rule`**, optionally — the plugin implies one; write yours with `owner` naming the
  document that holds the reasoning, and the finding's hint points there.

The check's id is `nestjs-db-access`. The repository layer, the entities
(`**/entities/**`, `**/*.entity.ts`) and the specs may import the ORM by default — an entity
is the ORM's schema. Name `except` only to change that list, and never to exempt a service.

## What it refuses

At load, by name: an option it does not have (`modulesRoot`, `allowedFrom`, `ruleDocument`
— the old spellings), an empty `modulesDir` or `ormPackage`, and `zone`. At run time a
`modulesDir` that matches no tracked file fails on the corpus floor rather than banning
nothing in silence.

## Refuse to

- raise the ratchet to accommodate a new direct import;
- add a service to `except`;
- treat the plugin's conventions as the whole of a backend's rules. It knows one stack's
  shape, not your domain — the rest is yours to declare.
