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

A documentation LAYOUT is one repository's decision. This package may know that a backticked
path is a claim; it may not know that module documents live under `src/`. Everything
locational is an option, and a default that encodes one repository's layout is the defect
to watch for in review — it makes the check wrong for every consumer that has not heard of
it, silently, because a pattern that matches nothing finds nothing.

## Invariants

1. **Every check refuses a corpus below its corpus floor.** All five read a pathspec, and a
   pathspec that stops matching is the entire failure mode of this package: the check
   runs, examines nothing, reports green, for months. Each reads its corpus through
   `_shared/corpus` (`corpusOf`, `refusedCorpus`), takes `corpus: { atLeast }` (default
   one document) and prints the engine's pass line. A new check without them is not
   finished.

2. **A corpus is named by its role, and exemptions are `except`.** `docs` and `code` are
   pathspecs (or lists) over tracked files; `except` is pathspecs, read as git reads them.
   Four spellings — `skipDirs` (a prefix), `skipped` (a RegExp), `excludeCode` (a
   substring), `renderedSources` (a list) — did that job, each honoured by one check, so an
   archive left out of one was read by the next.

3. **One ratchet per check, and it is the engine's.** A check's soft findings are counted
   against `ratchet` and the stored threshold (`thresholdOf`), and the count is stated as
   `measured` (`debtVerdict`). `countRatchet`, `menu.ordinalRatchet` and the inline-only
   ratchets of `docPlacement` and `docHygiene` never saw the stored threshold, and the last
   two reported no error line under a tolerated pass — so `--tighten` stored 0 and the next
   run failed. A hard defect (a dead link, an inbound link into the plans, a menu number
   that does not exist) is never soft.

4. **A numeral is a count; a word is not.** `docCounts` reads digits deliberately. "Four
   services" in prose is as often a quantity as an inventory, and a check that guesses
   produces findings nobody can act on — which is how a rule gets switched off.

5. **`docHygiene` follows `./` and `../` only.** Widening it to absolute-looking paths
   means guessing at a URL space this package cannot see.

6. **`docSymbols` needs `suffixes`, and `docCounts` needs `countableNouns` — never empty,
   never holding `''`.** Each list is spliced into an alternation, and an alternation of
   nothing matches the empty string: `[]` was the WIDEST setting while the scaffolds'
   comments called it inert. `nonEmpty` refuses the list; the factory refuses an empty
   string inside it.

7. **Every factory checks its options with `checkOptions` before it builds anything,**
   and refuses `zone` — a module's check speaks for the package. A misspelled option was
   dropped in silence, and the check ran without it. A new option goes into the factory's
   spec in the same edit; a nested object (`menu`) is checked the same way.

8. **A check's id defaults to its factory's name in kebab case, and its body reads the id
   from `self`.** The id the options carried was `undefined` for a check named by its file,
   and findings were attributed to nothing. A body never writes `ruleId`: `buildCheck`
   stamps it.

9. **`docsChecks` applies `tier`, `when`, `docs`, `except` and `corpus` to every check, and
   refuses what belongs to one.** It accepted `tier` and `when` and dropped them. An `id`,
   a `title`, a `rule` or a `ratchet` belongs to one check and is refused by name. It
   refuses a missing fact too — a preset returning four checks when five were expected is a
   roster somebody believes is complete; leaving one out is the consumer's `false`.

## Changing a check

- The fixture lives in [`_playground/repository.ts`](./_playground/repository.ts), as
  `CLEAN` and `BROKEN`. `BROKEN` carries one defect per rule, each commented with the
  shape its check looks for. Add the defect there when you add a rule.
- A new factory must be named in `COVERED`. The playground asks the engine's
  `uncoveredFactories` which exported factories the claim misses — probing each export
  with `PROBE` and reading a check, or a refusal by name, as a factory — and fails when it
  names one.
- Run `pnpm --filter @specwarden/docs test`, then `pnpm gate --id unit`.

## What belongs somewhere else

- A check about PLANS is `@specwarden/plans`: a plan is a document, but its lifecycle is
  a way of working and this package would be asserting it for consumers that plan
  differently.
- A check about where a file lives that is not a document is `pathContract`, in the
  engine.
