---
name: specwarden-plans
description: Use when a repository keeps work-in-progress documents — plans, RFCs, decision logs — and they need to name acceptance commands, record rejected alternatives, and die when the work is done.
---

# specwarden-plans

`@specwarden/plans`

A plan that outlives its work is worse than no plan: it describes an intended future in
the present tense, and the next reader cannot tell which parts already happened.

| Check              | Catches                                                                  |
| ------------------ | ------------------------------------------------------------------------ |
| `planShape`        | a plan that names no acceptance command, or sizes somebody's work        |
| `planStaleness`    | a finished plan still in the live corpus, or a citation into the archive |
| `decisionLogShape` | a rejected alternative recorded without the reason it was rejected       |

## Wiring

```js
import { planShape } from '@specwarden/plans';

export const check = planShape({
  id: 'plan-shape',
  title: 'a plan names real gate ids and every phase has an acceptance command',
  tier: 'fast',
  plans: 'docs/_plans/*.md',
  statuses: ['draft', 'in-progress', 'done'],
});
```

## What a plan must carry, and why each one

**An acceptance command per phase.** Without it "done" is an opinion. With it, the phase
is finished exactly when a command somebody else can run says so.

**A rejected alternative carries its reason.** The list of what was rejected is the only
thing that stops the same alternative being re-proposed every quarter — and a rejection
with no reason reads as an oversight rather than a decision.

**A branch declaration, when the work has one.** `planStaleness` uses it to tell a plan
whose branch merged from one that was abandoned, and it degrades honestly: a checkout
with no refs answers "cannot tell" and the check skips rather than inventing a verdict.

## Refuse to

- let a plan size somebody's work in hours or days — a phase expresses dependency and
  deployability, never how much to do at once;
- keep a plan after its work lands. Archive it with its harvest; a deleted plan leaves
  nothing to check, and absence looks the same as a plan nobody wrote.
