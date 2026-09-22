---
name: gates
description: How this repository checks itself, where a gate lives, and what makes one worth running.
---

# gates

## 1. The repository is its own first consumer

Every argument specwarden makes is about somebody else's repository: one list, a check
that cannot fail is a defect, a rule without an enforcer is a wish. A repository making
those arguments while keeping its own guards as loose scripts in a shell chain would be
making them from a position it had not tested — and would be the second consumer its own
README admits the engine has never had.

So the guards are **checks**, under `.specwarden/checks/`, run by the engine this
repository publishes. `pnpm gate` is the list. There is no second place to add one.

## 2. Where the logic lives

The pure logic stays in `scripts/`, where a person can run it directly and where it has
its own test. `.specwarden/checks/` **wraps** it.

That split is deliberate: a contributor debugging the scaffolder wants
`node scripts/scaffold.mjs`, not a gate runner — and a gate whose logic is inline is a
gate whose logic cannot be unit-tested.

## 3. Two tiers

| Tier    | What is in it                                                        | When           |
| ------- | -------------------------------------------------------------------- | -------------- |
| `fast`  | everything that only reads files and answers the same on any machine | a commit       |
| `heavy` | building, packing, installing, the full suites                       | a push, and CI |

There is no `nightly`. The one thing slow enough to want one is mutation testing, and it
has its own command in the engine's package rather than a schedule nobody watches.

## 4. A gate declares how it can fail

See `skills/checks/SKILL.md` §3. In this repository specifically: every wrapped `pnpm -r`
command carries a refusal for `No projects matched the filters`, because pnpm reports an
empty selection as **success** — the exact defect this product is named after, in the
tool it is run with.

## 5. Adding one

1. the logic in `scripts/`, with a test beside it;
2. a file under `.specwarden/checks/<family>/<id>.check.mjs`;
3. the rule it enforces, declared on the check;
4. **show it red before believing it.**

Nothing else. A file under `checks/` is a gate the moment it exists, and a file there
that exports no check is a load error rather than a silent skip.
