---
name: checks
description: How a check is written, and the declarations that stop it going silent.
---

# checks

## 1. The failure every check is written against

**A check that cannot fail reports success.** Not a red run — a _green_ one, which is
worse, because green is the signal everyone acts on.

Every way a check goes silent is a way it stopped being able to fail: a glob that matches
nothing, a path filter pointed at a file that moved, a package filter that selected no
package, a pattern that stopped matching after a format changed. None of them error.

## 2. Reach for the narrowest thing that fits

| You are expressing             | Use                                                                                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| a structural rule with no body | a primitive: `forbidImport`, `forbidPattern`, `mustDeclare`, `pathContract`, `siblingRequired`, `referencesResolve`, `regenerable`, `sourcesAgree` |
| a body of your own             | `defineCheck({ run: ctx => findings })`                                                                                                            |
| a function you already have    | `fromResult({ run })` — it takes `{ errors }` / `{ failures }` / `{ notes }` unchanged                                                             |
| somebody else's command        | `commandCheck({ cmd })`                                                                                                                            |

A primitive is tested as part of the product, so a consumer who uses one writes no test
for it. That is the larger of the two wins.

## 3. Say what a green run must have looked at

Not optional where it applies. Each is one line, and each closes a whole family:

- **`corpus: { atLeast: n }`** on `defineCheck` — a run that examined fewer units than
  that is a hard failure, not a pass. The body reports what it saw as `examined`.
- **`paths: [...]`** on `commandCheck` — the files a command is pointed at are verified
  through the file port _before_ it is spawned. A test runner handed a path it cannot
  find runs the rest and exits 0.
- **`expect` / `refuse`** on `commandCheck` — what the output must contain for a zero
  exit to be believed, and the phrases a tool prints when it silently did nothing.

On `defineCheck` and `commandCheck` none is on by default, because only the check knows what
its own corpus should look like. **The primitives are the exception**: `forbidPattern`,
`forbidImport`, `referencesResolve`, `sourcesAgree` and `zoneBoundary` refuse an empty
corpus by default and print how many files a clean pass examined, because their corpus IS
their one glob — and every one of them passed in silence over a glob that matched nothing,
which made the things sold as the cure the place the defect lived. A consumer who expects an
empty set says so: `corpus: { atLeast: 0 }`.

All of them are cheaper than the incident.

## 4. Read the world only through the ports

`ctx.files`, `ctx.vcs`, `ctx.proc`, `ctx.clock`, `ctx.writer` — gated by the capabilities
the check declares. A check with no `write` capability has no writer at all.

A check reaching for the platform's file API directly cannot be run against a constructed
tree, which means it cannot be unit-tested at all, which means the first thing anybody
learns about it being wrong is a consumer's red CI.

A check receives **no repository root**. A root passed from outside changes when the
caller moves; that defect is on record, with ten bodies pointing into the wrong folder
the day they gained a parent directory.

## 5. Every check names the rule it enforces

`rule: { statement, owner }` on the check itself. An unattributed check is one nobody can
argue with, relax deliberately, or retire — and `orphan-check` fails a check that names
none.

A rule enforced by exactly one check belongs **on** that check. The rule register is for
what can live nowhere else: a rule no single check owns, and a rule nothing can check.
Declaring the same id in both places is refused at load.

## 6. A check never prints

It returns findings. The reporter renders them — as terminal text, as JSON, as
annotations on a diff — and it cannot do any of that with something already written to
stdout.

## 7. A repair only where the answer is derivable

`fix` is for a stale generated artifact, where the generator's output is correct by
definition. It is not for a layering violation: there are several correct repairs, the
check knows none of them, and a fix that guesses is worse than a failure that names the
file.
