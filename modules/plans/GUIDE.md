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
// .specwarden/checks/plans/plans.check.mjs
import { planChecks } from '@specwarden/plans';

export const checks = planChecks({ plansDir: 'docs/_plans', archiveDir: 'docs/_plans-archive' });
```

That is the whole module — `plan-staleness`, `plan-shape` and `decision-log-shape`, each in
the `fast` tier — and the two folders shown are the defaults, so `planChecks()` says the
same thing. Each check still takes its own options, laid over the preset's, or `false` to
leave it out:

```js
import { planChecks } from '@specwarden/plans';

export const checks = planChecks({
  plansDir: 'planning',
  archiveDir: 'planning-archive',
  shape: { nameRe: /^[A-Z]+-\d+-[a-z0-9-]+\.md$/ },
  decisions: false,
});
```

| Option       | Kind                                   | Default               |
| ------------ | -------------------------------------- | --------------------- |
| `plansDir`   | directory                              | `docs/_plans`         |
| `archiveDir` | directory                              | `docs/_plans-archive` |
| `staleness`  | `planStaleness` options, or `false`    | the preset's          |
| `shape`      | `planShape` options, or `false`        | the preset's          |
| `decisions`  | `decisionLogShape` options, or `false` | the preset's          |

**Keep the archive OUTSIDE the plans folder.** Plans are flat — a folder inside
`plansDir` is a hard failure, because a nested plans folder is how plans stop being
deleted.

**A plans folder that does not exist is a failure naming it**, in `planStaleness` and
`planShape` alike — a `plansDir` left pointing at a folder that moved would otherwise
report a clean lifecycle forever. A folder that exists and holds no plan yet passes and
says `nothing in flight`, which is true. An archive that does not exist yet is a
repository that has finished nothing, and is not a failure.

Every factory takes the engine's identity — `id`, `title`, `tier` (default `fast`),
`when`, `hint`, `rule`, `ratchet` — and refuses an option it does not have, by name, when
the file loads.

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

A link into the archive is read in both spellings: the archive's path written out, and a
relative link that lands in it, resolved against the document it is written in.

```js
import { planStaleness } from '@specwarden/plans';

export const check = planStaleness({ id: 'plan-staleness', title: 'no plan outlives its work' });
```

| Option                    | Kind                                 | Default                                         |
| ------------------------- | ------------------------------------ | ----------------------------------------------- |
| `plansDir`                | directory                            | `docs/_plans`                                   |
| `archiveDir`              | directory                            | `docs/_plans-archive`                           |
| `branchDeclaration`       | RegExp, the branch in its last group | `**Branch:** <name>`                            |
| `statusDeclaration`       | RegExp, the status in its last group | `**Status:** draft/active/done`                 |
| `activeStatuses`          | status words                         | `['active']`                                    |
| `doneStatuses`            | status words — finished, harvest due | `['done']`                                      |
| `archiveHeader`           | `[{ label, pattern }]`               | Started, Finished, Branch, Harvested, Left open |
| `mayCiteArchive`          | files that may link into the archive | both folders' `README.md`                       |
| `undeclaredStatusRatchet` | plans tolerated with no status       | `0`                                             |
| `when`                    | relevance                            | a markdown file changed                         |

### The default convention

Five options describe how a plan declares itself, and a consumer with no convention yet
cannot answer them — so they default to a bolded-markdown header, which is what a plan
written by hand already looks like:

```markdown
**Status:** active
**Branch:** feature/thing
```

Every one is overridable. What is not overridable is that the declarations exist.

## `planShape`

```js
import { planShape } from '@specwarden/plans';

export const check = planShape({ id: 'plan-shape', title: 'a plan names real gates and says when it is done' });
```

Hard failures: the filename shape, a folder in the plans directory, and an acceptance
naming a `--id` that is not a known check. Ratcheted: work sizing, and phases with no
acceptance command.

| Option              | Kind                         | Default                                                                                 |
| ------------------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| `plansDir`          | directory                    | `docs/_plans`                                                                           |
| `nameRe`            | RegExp over the filename     | `DEFAULT_PLAN_NAME` — kebab-case, `refunds.md`                                          |
| `allowedNonPlans`   | filenames that are not plans | `['README.md']`                                                                         |
| `sizingPatterns`    | RegExps                      | `DEFAULT_SIZING` — a number of hours, days, weeks, points                               |
| `phaseHeadingRe`    | RegExp                       | `DEFAULT_PHASE_HEADING` — `## Phase` or `### Phase`                                     |
| `commandRe`         | RegExp over a phase's lines  | `DEFAULT_COMMAND` — `pnpm`, `npm`, `npx`, `node`, `bash`, `make` … or `**Acceptance.**` |
| `knownGateIds`      | check ids                    | the run's own roster                                                                    |
| `sizingRatchet`     | number                       | `0`                                                                                     |
| `unacceptedRatchet` | number                       | `0`                                                                                     |

The four patterns are ENGLISH, and exported, so a house that plans in another language
starts from them rather than meeting a check that finds no phase and calls every plan
well-shaped.

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

```js
import { decisionLogShape } from '@specwarden/plans';

export const check = decisionLogShape({ id: 'decision-log-shape', title: 'a rejection states why' });
```

| Option | Kind         | Default            |
| ------ | ------------ | ------------------ |
| `docs` | git pathspec | `docs/_plans/*.md` |

A pathspec that matches nothing is a failure naming it.
