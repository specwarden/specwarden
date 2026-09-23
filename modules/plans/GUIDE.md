# @specwarden/plans — guide

Three checks over documents that describe work IN FLIGHT: implementation plans and
decision logs.

## Why a plan needs checking at all

A plan describes an intended future **in the present tense**, which is exactly what a
reader — and an agent — cannot distinguish from a description of the present. One that
outlives its work does not merely go out of date: it asserts a false present, in a folder
whose whole purpose is to be believed while the work is under way.

The lifecycle this package assumes (a plan is written, worked, harvested and archived; a
decision is raised, argued and closed) is **one way of working, not the only one**. A
house that plans differently does not install this module, rather than switching its
checks off one by one.

## Install and wire

```bash
pnpm add -D @specwarden/plans
```

```js
import { planStaleness, planShape, decisionLogShape } from '@specwarden/plans';

export const checks = [
  planStaleness({
    id: 'plan-staleness',
    title: 'no plan outlives its work',
    tier: 'fast',
    plansDir: 'docs/_plans',
    archiveDir: 'docs/_archive',
  }),
];
```

**Keep the archive OUTSIDE the plans folder.** Plans are flat — a folder inside
`plansDir` is a hard failure, because a nested plans folder is how plans stop being
deleted.

## `planStaleness` — three decidable states

1. an **active** plan whose branch no longer resolves: the work merged and nobody
   harvested it;
2. a **draft** that names a branch: it arms a hard failure for the day that branch is
   cleaned up, and reads as started work nobody started;
3. an inbound **link to an archived plan**: the citing document starts lying the moment
   the archived work lands.

Plus the archive's own header — an entry that does not say what was harvested and what
was left open is a slower delete, because the reader cannot tell how far to trust it and
so trusts it fully.

**A checkout with no branch refs SKIPS.** "Cannot tell" stays active: a guess here
archives live work, which is worse than every defect the check finds.

### The default convention

Five options describe how a plan declares itself, and a consumer with no convention yet
cannot answer them — so they default to a bolded-markdown header, which is what a plan
written by hand already looks like:

```markdown
**Status:** active
**Branch:** feature/thing
```

Every one is overridable (`branchDeclaration`, `statusDeclaration`, `activeStatuses`,
`archiveHeader`, `mayCiteArchive`). What is not overridable is that the declarations
exist.

## `planShape`

```js
planShape({
  id: 'plan-shape',
  title: '…',
  tier: 'fast',
  plansDir: 'docs/_plans',
  nameRe: /^[A-Z]+-\d+-[a-z0-9-]+\.md$/,
  allowedNonPlans: ['README.md'],
  sizingPatterns: [/\b\d+\s*(hours?|days?|story points?)\b/i],
  phaseHeadingRe: /^(#{2,3})\s+Phase\b/,
  commandRe: /^\s*(pnpm|npm|node|bash)\s/,
});
```

Hard failures: the filename shape, a folder in the plans directory, and an acceptance
naming a `--id` that is not a known check. Ratcheted: work sizing, and phases with no
acceptance command.

`knownGateIds` defaults to **the run's own roster** — the list the engine is actually
running, which is the only honest one. A list built by hand could forget a check, and the
forgotten check would be invisible to the one audit meant to notice it.

There is no escape hatch for a plan that INTRODUCES a gate: state that phase's acceptance
as the script path until the gate lands. Deliberate, and the cost is real.

## `decisionLogShape`

One rule: a rejected alternative states **why** it lost. A rejection with its reason is
exactly the fact that lives only in the plan and is lost if it is archived without
harvest. A reason is an assertion, not an apology.

```markdown
### Decision: results are ticked, never typed

- Rejected: a free-text amount — a typed number reconciles against nothing.
```

The separator is `—`, `--`, or the word `because`.
