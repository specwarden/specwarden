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

The primitives name their corpus differently — `in` on `forbidPattern` and
`referencesResolve`, `from` on `forbidImport`, `files` on `mustDeclare`, `subjects` on
`siblingRequired`, `kind` on `pathContract` — and stay that way until a major version: one
name across them is a rename every consumer's check files would have to follow. A new
primitive whose corpus is a pathspec to scan takes `in`.

## 2a. Write only what the engine cannot know

A check is the information it carries. Everything else has a default the engine can
derive, and a field restated where a default would do is a field that drifts:

- **`tier`** — `fast`. A tier outside the config's `tiers` is refused at load: it ran
  under `--all` and was in no schedule, so no `--tier` ever ran it.
- **`title`** — the rule's statement, else the id.
- **`id`** — the file's stem, for a check exported **alone** from `<name>.check.mjs`. A
  file exporting several checks gives each its own id; one built anywhere else — the
  config's `checks`, a plugin — must say it, and is refused at load if it does not.
- **`rule`** — a string is the statement. A rule with no `owner` is owned by the file that
  declares it.

So the one-line check is one line:

```js
export const check = forbidPattern({ in: 'src/**/*.ts', pattern: /TODO/, rule: 'no TODO in shipped source' });
```

**A file that names its check keeps that name.** The id is inferred only when the file is
silent. Refusing an id that differs from the file name was rejected: a file exporting a
plugin's checks legitimately carries several ids, none of them its own name.

**Every factory checks its options when the file loads**, by name and with exit 2: a
missing `pattern` crashed the run, a misspelled `except` was dropped in silence and a
wrong type surfaced as a crash three layers down. A factory built on `buildCheck` gets
this by declaring a `checkOptions` spec; one that skips it is the silent drop, back.

## 3. Say what a green run must have looked at

Not optional where it applies. Each is one line, and each closes a whole family:

- **`corpus: { atLeast: n }`** on `defineCheck` — a run that examined fewer units than
  that is a hard failure, not a pass. The body reports what it saw as `examined`.
- **`paths: [...]`** on `commandCheck` — the files a command is pointed at are verified
  through the file port _before_ it is spawned. A test runner handed a path it cannot
  find runs the rest and exits 0.
- **`cwd`** on `commandCheck` — the directory the command runs in, relative to the root;
  verified the same way before it spawns, because a `cd` into a directory that moved runs
  nothing and exits 0.
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

**A module's check comes with its rule.** Every factory a module ships supplies one,
marked `implied` and owned by the package (`@specwarden/docs`): the module knows what its
check enforces, and a preset's checks had nowhere for a consumer to write one, so every
GUIDE-wired check was an orphan the day a register existed. An implied rule yields — a
`rule` the consumer writes replaces it, and a register entry naming the check drops it.
A new module factory supplies one too; a primitive does not, because what a
`forbidPattern` enforces is the consumer's to say.

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
