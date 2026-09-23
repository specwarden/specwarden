---
name: maintaining-speckit
description: What may not change in @specwarden/speckit, and why — read before editing the source adapter.
---

# Maintaining `@specwarden/speckit`

The MAINTAINER's document. Using the package is [GUIDE.md](./GUIDE.md); reasoning about
it inside somebody else's repository is
[skills/specwarden-speckit/SKILL.md](./skills/specwarden-speckit/SKILL.md).

## Why this package exists at all

To keep the port honest. Two adapters can share an accident; three cannot. If a change to
`ISpecSource` is easy in one adapter and awkward in the other two, the change is wrong —
that is the signal this package is here to give, and it only gives it while all three
stay in step.

## Invariants

1. **`found: false` when the tree is absent — never an empty list.** Same contract as
   every adapter: an empty list reads as "nothing to do", and the reconciliation then
   prints agreement about a tree it never read.

2. **An id keeps its upstream spelling, prefixed by its feature.** Two features both
   numbering from `FR-001` is the normal case. Without the prefix they collapse into one
   id and the second requirement silently stops existing, with every count still looking
   right.

3. **The statement is carried through untranslated.** Attaching proof is this engine's
   job; rewording another tool's requirement is not. The requirement line is matched
   loosely on purpose — the id is what must be exact.

4. **Every path is an option.** `root`, `specFile`, `tasksFile`. A memorised layout turns
   the tool's next reorganisation into a source that finds nothing while reporting
   success.

5. **SpecWarden never writes here.**

## Changing the adapter

- Change this, `@specwarden/openspec` and the engine's native source together whenever
  the PORT changes. One implementation moving alone is the port being redefined by
  accident.
- The playground deliberately mirrors the OpenSpec one, differing only where Spec Kit
  differs: ids come from the document rather than from the wording, and both requirements
  and tasks live inside one feature folder.
- Run `pnpm --filter @specwarden/speckit test`.
