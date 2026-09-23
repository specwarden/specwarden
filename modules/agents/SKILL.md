---
name: maintaining-agents
description: What may not change in @specwarden/agents, and why — read before editing the definition check.
---

# Maintaining `@specwarden/agents`

The MAINTAINER's document. Using the package is [GUIDE.md](./GUIDE.md); reasoning about
it inside somebody else's repository is
[skills/specwarden-agents/SKILL.md](./skills/specwarden-agents/SKILL.md).

## Invariants

1. **No agent directory is a PASS, not a violation.** "Nobody runs agents here" and "the
   roster is broken" are different answers, and only one of them is red. This is what
   keeps the module installable in a repository that has not adopted agents yet.

2. **The spawn restriction is the reason this module exists.** Everything else here is
   frontmatter validation, which is cheap and mildly useful. A leaf role that can spawn
   turns a bounded pipeline into an unbounded one — do not soften it into a warning.

3. **`orchestrators` is asked for, never inferred.** Inferring it from which roles
   already spawn makes the check agree with whatever the repository currently does, which
   is a check that cannot fail.

4. **The assistant's vocabulary is an option.** `spawnTools` names tools that start
   another agent, and which tool does that is a fact about the assistant, not about this
   package. A hard-coded name makes the check wrong — silently, by matching nothing — for
   every other harness.

5. **`name` must match the filename.** It is the one rule whose failure is invisible at
   the file: the harness addresses agents by name, so a mismatch surfaces as an unknown
   agent at a call site nowhere near the cause.

## The parser

`parseFrontmatter` reads flat `key: value` with folded `>` and `|` blocks. The folded
case has a test because it is how long descriptions are actually written, and reading it
wrong makes the check report a missing field that is plainly there — the fastest way to
get a rule switched off.

## Changing the check

- The fixtures live inline in
  [`_playground/playground.spec.ts`](./_playground/playground.spec.ts): a roster a house
  would keep, and the same roster with one defect per rule.
- Run `pnpm --filter @specwarden/agents test`.

## What belongs somewhere else

- What an agent may DO in a repository is the engine's perimeter, not a frontmatter rule.
- How many agents to spawn, and which model each deserves, is a host's own documentation
  — a check cannot decide it and should not pretend to.
