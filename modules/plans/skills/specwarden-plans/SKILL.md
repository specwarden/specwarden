---
name: specwarden-plans
description: Use when a repository keeps work-in-progress documents — plans, RFCs, decision logs — and they need to name acceptance commands, record rejected alternatives, and die when the work is done.
---

# specwarden-plans

`@specwarden/plans`

## When to reach for it

A plan that outlives its work is worse than no plan: it describes an intended future in
the present tense, and the next reader cannot tell which parts already happened. Reach for
this module when a repository keeps plans for work in flight and deletes or archives them
when the work lands. A repository that plans differently should not install it.

| Check                | Catches                                                                  |
| -------------------- | ------------------------------------------------------------------------ |
| `plan-shape`         | a plan that names no acceptance command, or sizes somebody's work        |
| `plan-staleness`     | a finished plan still in the live corpus, or a citation into the archive |
| `decision-log-shape` | a rejected alternative recorded without the reason it was rejected       |

## The wiring

All three, in one file under `.specwarden/checks/`:

```js
import { plansChecks } from '@specwarden/plans';

export const checks = plansChecks({ plansDir: 'docs/_plans', archiveDir: 'docs/_plans-archive' });
```

Both folders are the defaults; name them when the repository keeps plans elsewhere. One
check alone takes the same defaults:

```js
import { planShape } from '@specwarden/plans';

export const check = planShape({ plansDir: 'docs/_plans' });
```

Each check's id is its factory's name in kebab case, and it carries the rule the package
implies. Write no `id` or `title` unless the repository means something else by it.

**What a plan must carry, and why each one.** A `**Status:** draft | active | done` line,
so a draft can be told from work under way. A `**Branch:** <name>` once work has started —
`plan-staleness` uses it to tell a plan whose branch merged from one still in progress, and
a checkout with no refs answers "cannot tell" rather than inventing a verdict. An
acceptance command per phase — without it "done" is an opinion. A reason for every rejected
alternative — the list of what was rejected is what stops the same alternative being
re-proposed every quarter.

**Arm it at reality.** On a repository with old plans, set `ratchet` to the current count
of the check's debt — undeclared statuses, or sizing and unaccepted phases — and let
`--tighten` lower it as the plans are fixed.

## What it refuses

- An option a factory does not have, a value of the wrong kind, an empty list, and `zone`
  — by name, when the file loads. Patterns are `name`, `phaseHeading`, `command` and
  `sizing`; the bar is `ratchet`; an exemption is `except`.
- On `plansChecks`: an `id`, `title`, `rule` or `ratchet`, which belong to one check —
  give them in that check's entry (`shape: { ratchet: 2 }`).
- At run time: a plans folder that does not exist (point `plansDir` at the real one, never
  delete the check), a plan naming an `--id` the run does not know, and a `docs` pathspec
  that matched nothing. A folder with no plan in it passes as "nothing in flight".

## Refuse to

- let a plan size somebody's work in hours or days — a phase expresses dependency and
  deployability, never how much to do at once;
- keep a plan after its work lands. Archive it with its harvest, or delete it; a stale plan
  asserts a false present in the one folder whose purpose is to be believed;
- raise a ratchet, or lower a corpus floor, to make a run green.
