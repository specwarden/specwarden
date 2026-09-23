---
name: maintaining-ops
description: What may not change in @specwarden/ops, and why — read before editing a check in this package.
---

# Maintaining `@specwarden/ops`

The MAINTAINER's document. Using the package is [GUIDE.md](./GUIDE.md); reasoning about
it inside somebody else's repository is
[skills/specwarden-ops/SKILL.md](./skills/specwarden-ops/SKILL.md).

## The family these five belong to

Every defect this module finds **loads cleanly and boots green**. There is no crash, no
red line, no stack trace — the config is valid and the system is wrong. That is why the
checks here can afford to be strict about "found nothing": in this family, finding
nothing is the normal way to be broken.

## Invariants

1. **"Found nothing" is a failure, everywhere in this package.** A compose file that
   could not be read, a workflow whose scan yielded no jobs, a proxy config with no
   upstream, a packages directory that produced no manifests — every one of those is red
   rather than green. Each was once a silent pass, and each was found by a person, late.

2. **"Absent" is SKIPPED, and skipped is not a pass.** Env files are gitignored; a mode
   whose files are simply not there is reported as skipped with the reason. Do not
   collapse this into either a pass or a failure — the first is a green nobody earned,
   the second makes the check unusable on an ordinary checkout.

3. **An interpolated value is left alone.** `{$VAR}` and `${MODE}` resolve from an
   environment this package cannot see. A guess produces a finding nobody can act on,
   which is how a rule gets switched off.

4. **The parsers are line-based, and every shape that broke one has a test.** Prose that
   mentions a gate id, a list wrapped over two lines, the matrix placeholder itself, a
   commented directive, a heredoc body, a nested function definition. Do not simplify a
   parser without carrying its cases — each of them, once, made a check report coverage
   it did not have.

5. **Exports are NAMED, never `export *`.** Two checks export a `violationsFor`. `export
*` makes that ambiguous — silently in an editor, then loudly at the declaration emit —
   and naming them is also how the collision gets a decision instead of a default.

## Changing a check

- The fixture is [`_playground/repository.ts`](./_playground/repository.ts): ONE
  deployment repository in two states, not one fixture per check. The five checks read
  the same repository from five angles, and a fixture per check lets those angles drift
  until the playground describes a repository nobody could have.
- The unit specs carry the parser cases; the playground carries the wiring. Both, for a
  new rule.
- Run `pnpm --filter @specwarden/ops test`.

## What belongs somewhere else

- A rule about a FRAMEWORK's layout is a plugin (`@specwarden/plugin-nestjs`), not this.
- A rule about a file's location with no stack assumption is `pathContract`, in the
  engine.
