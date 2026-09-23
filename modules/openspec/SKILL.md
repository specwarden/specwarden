---
name: maintaining-openspec
description: What may not change in @specwarden/openspec, and why — read before editing the source adapter.
---

# Maintaining `@specwarden/openspec`

The MAINTAINER's document. Using the package is [GUIDE.md](./GUIDE.md); reasoning about
it inside somebody else's repository is
[skills/specwarden-openspec/SKILL.md](./skills/specwarden-openspec/SKILL.md).

## Invariants

1. **`found: false` when the tree is absent — never an empty list.** An empty list reads
   as "nothing to do", and the reconciliation then prints agreement about a tree it never
   read. This is the contract EVERY `ISpecSource` adapter owes, and it is the one this
   adapter has already broken once: `requirements()` returned `found: true` with nothing
   in it, and `sync-invariants` printed "0 requirements" followed by "✓ in sync".

2. **Found-but-empty carries a NOTE.** A specs directory with no recognisable heading is
   a real state, and it is not agreement. The note names what was looked for and suggests
   the option that would fix it.

3. **SpecWarden never writes here.** Reading a foreign tool's directory is the whole
   relationship; writing to it is what the ownership map forbids. A "fix" that edits an
   OpenSpec file is not a fix, it is a second owner.

4. **Every path is an option.** `root`, `specFile`, `requirementHeading`. A tool that
   reorganises in a minor release is normal, and a memorised layout turns that into a
   source that finds nothing while reporting success.

5. **An id is prefixed by its capability.** OpenSpec identifies a requirement by its
   wording, and two capabilities may word one the same way. Without the prefix they merge
   into one id and the second requirement silently stops existing — with every count
   still looking right.

## Why this is a module at all

An integration with somebody else's tool cannot be a mandatory part of a quality harness.
A repository that has never heard of OpenSpec would otherwise carry its layout
assumptions, and every such assumption breaks on that tool's next release.

## Changing the adapter

- Two adapters can share an accident; three cannot. When changing anything about the
  PORT, change `@specwarden/speckit` and the engine's native source in the same breath,
  or the port is being redefined by one implementation.
- The playground mirrors `@specwarden/speckit`'s deliberately: examining each adapter on
  its own terms would stop the suite being able to say whether the port is honoured.
- Run `pnpm --filter @specwarden/openspec test`.
