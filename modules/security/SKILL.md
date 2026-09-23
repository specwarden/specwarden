---
name: maintaining-security
description: What may not change in @specwarden/security, and why — read before editing the credential scan.
---

# Maintaining `@specwarden/security`

The MAINTAINER's document. Using the package is [GUIDE.md](./GUIDE.md); reasoning about
it inside somebody else's repository is
[skills/specwarden-security/SKILL.md](./skills/specwarden-security/SKILL.md).

## Invariants

1. **A deviation from the built-in library is REPORTED, and reported first.** Added,
   disabled and replaced patterns become info findings before any match is printed. A
   scanner that quietly stopped looking for something reads exactly like one that looked
   and found nothing, and this is the one place in the product where that distinction is
   a security property rather than a hygiene one.

2. **A pattern is anchored to a format, never to entropy.** A noisy guard is a disabled
   guard, and a disabled guard is worse than none because the repository believes it has
   one. A new pattern needs a fixed prefix, a fixed length, or both.

3. **The corpus is TRACKED files.** Not the working tree: dependencies would be scanned,
   the run would take minutes, and the finding would name a file nobody owns.

4. **The placeholder vocabulary is overridable.** It is English and conventional, which
   is wrong for some houses. A false positive from a table a consumer cannot reach is how
   this check gets switched off for good.

5. **The finding says ROTATE first.** Deleting the line leaves the credential in the
   history and in whatever already read it. The message order is not stylistic.

## The fixture trap, twice over

A fixture for this check necessarily contains something credential-shaped — so it would
trip a scan run over THIS repository. The playground assembles the key from parts rather
than writing it out, because needing an allowlist entry for a fixture is a smell: the
allowlist is for a file that necessarily contains the pattern, and a fixture that could
have been assembled does not qualify.

The second trap is subtler and was live: the default `scan` option is the **empty
string**, which means "every tracked file" to git. A test harness that forwards it to a
glob matches nothing, so the check examines an empty corpus and reports green — inside a
suite whose entire job is to prove the check can fail. `testContext` handles it now; a
hand-written tracked-file function must too.

## Changing the check

- Run `pnpm --filter @specwarden/security test`.
- A new pattern needs a case in the unit spec and, if it changes the scan's shape, one in
  [`_playground/playground.spec.ts`](./_playground/playground.spec.ts).

## What belongs somewhere else

- A rule about where env files live, or whether two of them agree, is `@specwarden/ops`.
- A rule about what a check may TOUCH is the engine's capability gating, not a pattern
  here.
