---
name: maintaining-the-engine
description: What may not change in the specwarden engine, and why — read before editing anything under core/src.
---

# Maintaining `specwarden` (the engine)

The MAINTAINER's document. Using the engine is [GUIDE.md](./GUIDE.md); reasoning about it
inside somebody else's repository is
[skills/specwarden/SKILL.md](./skills/specwarden/SKILL.md). The repository's own
conventions are [`skills/`](../skills/); this file is about the engine package
specifically.

## The line this package is drawn along

**The engine carries only what is true of ANY repository.** A documentation layout, a
plan lifecycle, a compose file, a vendor's credential format — each of those is a house's
decision and ships as a module. The test: _could this check be WRONG about a repository
that has never heard of it?_ If yes, it is an opinion and it leaves.

Zones, ratchets, capabilities, relevance and the rule registry are this engine's own
mechanics, and nothing else can own them.

The `zone-boundary` check enforces the half of this that is mechanizable: a product
source names no host literal and never imports the consumer zone.

## Invariants

1. **A check body returns findings; `defineCheck` builds the verdict.** Verdict assembly,
   rule attribution, the pass note and the corpus floor live in one place. Two verdict
   rules is how a ratchet starts meaning different things in different checks.

2. **A check reaches the world only through a gated port.** Adding an ungated way to the
   filesystem, a subprocess or the network defeats the property that makes installing
   someone else's check safe. The clock is ungated — time is harmless.

3. **Every route to "run everything" returns a STRING reason.** A full run that cannot
   say why it is one is indistinguishable from a tier nobody ever filtered.

4. **"Cannot tell" runs everything, never nothing.** An unreadable diff range, a checkout
   with no refs. The fail-safe direction is not a preference.

5. **`--tighten` records `verdict.ratchet.value` first, finding count second.** The
   fallback exists for ordinary checks; the field exists because three real checks
   summarised their violations into one line. Counting findings alone rewrote thresholds
   of 17 and 37 to 0.

6. **`SPECWARDEN_SKIP` is ignored under CI.** A skip that reaches the arbiter is a hole.

7. **A duplicate check id throws at registration.** The alternative is a check silently
   unreachable by `--id`.

8. **A reporter never prints the value of an environment variable.** Pinned by the
   adapter tests. A finding names what is wrong, not the secret behind it.

9. **A plugin declares; it never supplies a port adapter.** The loader refuses one.

10. **The testing kit is part of the product.** Measured in the first consumer: of 23
    tests written for check bodies, zero imported anything from the engine — all 23 built
    duck-typed literals that break the moment a check reads a second port. An unconfigured
    port therefore throws BY NAME rather than answering emptily.

## Changing the engine

- **The public surface is `core/src/index.ts`.** A consumer imports from the package
  root, never a subpath. Something worth using is worth exporting from the barrel.
- **The check contract has a version.** Changing `ICheck`'s shape means bumping
  `CHECK_CONTRACT_VERSION`, and every module must be rebuilt against it — the workspace
  playground asserts they agree, which is the one place a module built against an older
  engine is caught before a consumer's first run.
- **The scaffolded README is a product surface.** It is written into a stranger's
  repository and then checked by that repository's own gates. It must not, for instance,
  name a backticked path the template does not write — a starter tree that fails the
  first gate it ships with teaches the wrong thing about the gate.
- Run `pnpm --filter specwarden test`, then `pnpm gate --tier fast`, then
  `pnpm gate --tier heavy` — `verify-build` and `playgrounds` are where a change to the
  published shape actually surfaces.

## Where the rest lives

- [`_playground/`](./_playground/) — the engine assembled and run, the way a host
  assembles it. The unit suites all pass against an engine whose pieces no longer fit
  together; this is where the assembly is exercised.
- [`../_playground/`](../_playground/) — every package in one config.
- [`../skills/`](../skills/) — the repository's canon: checks, gates, testing, publishing,
  structure, commits, documentation, skills, typescript, playgrounds.
