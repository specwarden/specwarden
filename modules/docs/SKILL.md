---
name: maintaining-docs
description: What may not change in @specwarden/docs, and why — read before editing a check in this package.
---

# Maintaining `@specwarden/docs`

This is the MAINTAINER's document. How to use the package is [GUIDE.md](./GUIDE.md); how
an agent should reason about it in somebody else's repository is
[skills/specwarden-docs/SKILL.md](./skills/specwarden-docs/SKILL.md). Those three have
three different readers and collapsing any two produces a document that is wrong for one
of them.

## What this package is allowed to know

A documentation LAYOUT is a house's decision. This package may know that a backticked
path is a claim; it may not know that module documents live under `src/`. Everything
locational is an option, and a default that encodes one repository's layout is the defect
to watch for in review — it makes the check wrong for every house that has not heard of
it, silently, because a pattern that matches nothing finds nothing.

## Invariants

1. **Every check declares a corpus floor.** All five of these read a pathspec, and a
   pathspec that stops matching is the entire failure mode of this package: the check
   runs, examines nothing, reports green, for months. A new check without `corpus` is not
   finished.

2. **A numeral is a count; a word is not.** `docCounts` reads digits deliberately. "Four
   services" in prose is as often a quantity as an inventory, and a check that guesses
   produces findings nobody can act on — which is how a rule gets switched off.

3. **`docHygiene` follows `./` and `../` only.** Widening it to absolute-looking paths
   means guessing at a URL space this package cannot see.

4. **`docSymbols` needs `suffixes`, and `docCounts` needs `countableNouns` — never empty.**
   Without a shape that declares a kind, every backticked word in prose becomes a claim.
   Each list is spliced into an alternation, and an alternation of nothing matches the
   empty string: `[]` was the WIDEST setting while the scaffolds' comments called it
   inert. Both factories refuse an empty list when the file loads.

5. **Every factory checks its options with `checkOptions` before it builds anything.** A
   misspelled option — the shipped skill's `skipped:` for `skipDirs` — was dropped in
   silence, and the check ran without it. A new option goes into the factory's spec in
   the same edit, or the first consumer to pass it gets a load error.

6. **`docsChecks` refuses a missing fact; it never leaves a check out on its own.** A preset
   returning four checks when five were expected is a roster somebody believes is
   complete. Leaving one out is the consumer's `false`, said out loud.

## Changing a check

- The fixture lives in [`_playground/repository.ts`](./_playground/repository.ts), as
  `CLEAN` and `BROKEN`. `BROKEN` carries one defect per rule, each commented with the
  shape its check looks for. Add the defect there when you add a rule.
- A new factory must be named in `COVERED`. The playground finds every export that builds
  checks by what it does with an options object it cannot honour — it returns checks, or
  refuses the options by name — and fails when the two lists differ. One probe carrying
  every factory's options no longer works: a factory refuses an option it does not have,
  so that union read every factory as a helper and the audit passed over none of them.
- Run `pnpm --filter @specwarden/docs test`, then `pnpm gate --id unit`.

## What belongs somewhere else

- A check about PLANS is `@specwarden/plans`: a plan is a document, but its lifecycle is
  a way of working and this package would be asserting it for houses that plan
  differently.
- A check about where a file lives that is not a document is `pathContract`, in the
  engine.
