---
name: maintaining-plugin-nestjs
description: What may not change in @specwarden/plugin-nestjs, and why — read before adding a rule to it.
---

# Maintaining `@specwarden/plugin-nestjs`

The MAINTAINER's document. Using the package is [GUIDE.md](./GUIDE.md); reasoning about
it inside somebody else's repository is
[skills/specwarden-nestjs/SKILL.md](./skills/specwarden-nestjs/SKILL.md).

## Invariants

1. **A plugin declares checks and supplies no port adapter.** The loader refuses one, and
   this package must never need the refusal: a plugin that could reach the filesystem
   itself would be a way around the capabilities that make a check safe to install
   at all. Everything here is built from the engine's declarative primitives, so there is
   no I/O of its own for a capability to guard.

2. **The ratchet is the consumer's.** The plugin takes `ratchet`; the consumer owns the
   threshold behind it. A number shipped here would be asserting something about a repository this
   package has never seen — and it would be wrong for every repository but one.

3. **A rule belongs here only if it is a fact about the FRAMEWORK.** "A module reaches
   the database through a repository" is an architectural consequence of how NestJS is
   built. "Our gateways live in `src/api`" is a fact about one codebase, and it belongs
   in that codebase's own checks.

4. **The exemptions are what make a rule livable.** The repository layer is where the
   query belongs, an entity IS the ORM's schema, and the tests that exercise them
   necessarily reach the same package. The entities were missing from the defaults (now
   `DEFAULT_NESTJS_EXCEPT`), and every real service was red on its entity file on the first
   run. A rule with no exemptions is a rule that gets a blanket ratchet and stops meaning
   anything.

5. **Its check is built like every module's.** `nestjs` takes `IModuleCheckDeclaration`
   beside its own options: `id`, `tier`, `when`, `hint`, `rule`, `ratchet` reach the check
   (an `id`, `tier` or `when` was accepted and dropped), `zone` is refused, the id defaults
   to `nestjs-db-access` — no slash, which every tool read as a path — and the rule
   defaults to the one the package implies, owned by `@specwarden/plugin-nestjs`, in the
   `product` zone. Without it the check was an orphan in every consumer that keeps a
   register. `checkOptions` refuses a misspelled option at load: a misspelled exemption was
   dropped and the defaults applied in silence.

6. **Exemptions are `except` pathspecs, and the rule's owner is the rule document.**
   `allowedFrom` (suffixes under the modules directory) was a second spelling of "leave
   these files out", and `ruleDocument` a second spelling of the rule's `owner`. One word
   each, as everywhere else in the product.

7. **The barrel is the only import path a consumer depends on.** A second rule is a
   sibling folder under `src/`, exported from the barrel — not a longer index file and
   not a deeper import.

## Adding a rule

- Build it from a primitive (`forbidImport`, `forbidPattern`, `pathContract`, …) rather
  than a hand-written body, unless the rule genuinely cannot be expressed that way. A
  hand-written body carries its own verdict assembly, and two verdict rules is how a
  ratchet starts meaning different things in different checks.
- Every option that names a path or a package must be an option, not a literal.
- Add it to [`_playground/playground.spec.ts`](./_playground/playground.spec.ts): the
  clean tree, the broken tree, and the ratchet's two states.
- Run `pnpm --filter @specwarden/plugin-nestjs test`.

## What belongs somewhere else

- A rule about env files, proxy upstreams or CI coverage is `@specwarden/ops`, even for a
  NestJS backend — the stack is the subject there, not the framework.
- A rule about documentation is `@specwarden/docs`.
