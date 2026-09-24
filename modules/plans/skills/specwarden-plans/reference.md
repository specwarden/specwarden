<!-- GENERATED from modules/plans/GUIDE.md. Edit the guide. -->

# @specwarden/plans — guide

Three checks over documents that describe work IN FLIGHT: implementation plans and
decision logs.

A plan describes an intended future **in the present tense**, which is exactly what a
reader — and an agent — cannot distinguish from a description of the present. One that
outlives its work does not merely go out of date: it asserts a false present, in a folder
whose whole purpose is to be believed while the work is under way.

The lifecycle this package assumes (a plan is written, worked, harvested and archived; a
decision is raised, argued and closed) is **one way of working, not the only one**. A
repository that plans differently does not install this module, rather than switching its
checks off one by one.

## What it catches

| Check                | Factory            | Catches                                                                                 |
| -------------------- | ------------------ | --------------------------------------------------------------------------------------- |
| `plan-staleness`     | `planStaleness`    | an active plan whose branch is gone, a draft naming a branch, a citation of the archive |
| `plan-shape`         | `planShape`        | a plan off the naming convention, an unknown `--id`, sizing, a phase with no acceptance |
| `decision-log-shape` | `decisionLogShape` | a rejected alternative recorded without the reason it lost                              |

## Wiring

```bash
pnpm add -D @specwarden/plans
```

The whole module in one file:

```js
// .specwarden/checks/plans/plans.check.mjs
import { plansChecks } from '@specwarden/plans';

export const checks = plansChecks({ plansDir: 'docs/_plans', archiveDir: 'docs/_plans-archive' });
```

The two folders shown are the defaults, so `plansChecks()` says the same thing. Each check
takes its own options, laid over the preset's, or `false` to leave it out:

```js
import { plansChecks } from '@specwarden/plans';

export const checks = plansChecks({
  plansDir: 'planning',
  archiveDir: 'planning-archive',
  shape: { name: /^[A-Z]+-\d+-[a-z0-9-]+\.md$/ },
  decisionLog: false,
});
```

Or one check per file:

```js
// .specwarden/checks/plans/plan-shape.check.mjs
import { planShape } from '@specwarden/plans';

export const check = planShape({ plansDir: 'docs/_plans' });
```

A plan declares itself with a bolded header — `**Status:** draft`, `active` or `done`, and
once work has started `**Branch:** <name>` — and every phase ends with a command, or an
`**Acceptance.**` line. A check's id is its factory's name in kebab case, its title is the
rule it enforces, and that rule is implied by the package, owned by `@specwarden/plans`.
Write `id` or `rule` only to say something else.

**Keep the archive OUTSIDE the plans folder.** Plans are flat — a folder inside
`plansDir` is a hard failure, because a nested plans folder is how plans stop being
deleted.

## Options

Every factory takes the engine's identity beside its own options — `id`, `title`, `tier`
(default `fast`), `when`, `hint`, `advisory`, `rule` and `ratchet` — plus `corpus: {
atLeast }` and `except`, pathspecs left out. It refuses `zone`, an option it does not have,
an empty list and a value of the wrong kind, by name, when the file loads.

**`plansChecks`** takes the two folders, `tier` and `when` — applied to every check it
builds, a check's own winning — and one entry per check, or `false`. It refuses `id`,
`title`, `rule` and `ratchet`: three checks cannot share one; give it in that check's entry.

| Option        | Kind                                   | Default               |
| ------------- | -------------------------------------- | --------------------- |
| `plansDir`    | directory                              | `docs/_plans`         |
| `archiveDir`  | directory                              | `docs/_plans-archive` |
| `tier`        | tier, applied to every check           | `fast`                |
| `when`        | relevance, applied to every check      | each check's own      |
| `staleness`   | `planStaleness` options, or `false`    | the preset's          |
| `shape`       | `planShape` options, or `false`        | the preset's          |
| `decisionLog` | `decisionLogShape` options, or `false` | the preset's          |

### `planStaleness`

Three states a person cannot see: an **active** plan whose branch no longer resolves (the
work merged and nobody harvested it); a **draft** that names a branch (it arms a failure
for the day that branch is cleaned up); and a **link to an archived plan** from a live
document — its path written out, or a relative link that lands in the archive. Plus the
archive's own header: an entry that does not say what was harvested and what was left
open is a slower delete. Both folders' `README.md` own the archive contract and may name
it.

**A checkout with no branch refs SKIPS.** "Cannot tell" stays active: a guess here
archives live work, which is worse than every defect the check finds.

| Option              | Kind                                                      | Default                                         |
| ------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| `plansDir`          | directory                                                 | `docs/_plans`                                   |
| `archiveDir`        | directory                                                 | `docs/_plans-archive`                           |
| `docs`              | git pathspec, or a list — read for citations              | `**/*.md`                                       |
| `except`            | git pathspecs — plans not judged, documents that may cite | none                                            |
| `branchDeclaration` | RegExp, the branch in its last group                      | `DEFAULT_BRANCH_DECLARATION` — `**Branch:**`    |
| `statusDeclaration` | RegExp, the status in its last group                      | `DEFAULT_STATUS_DECLARATION` — `**Status:**`    |
| `activeStatuses`    | status words                                              | `['active']`                                    |
| `doneStatuses`      | status words — finished, harvest due                      | `['done']`                                      |
| `archiveHeader`     | `[{ label, pattern }]`                                    | Started, Finished, Branch, Harvested, Left open |
| `when`              | relevance                                                 | a markdown file changed                         |

The five declaration options default to the bolded header a hand-written plan already has,
and every one is overridable. What is not overridable is that the declarations exist.

### `planShape`

| Option          | Kind                        | Default                                                                                 |
| --------------- | --------------------------- | --------------------------------------------------------------------------------------- |
| `plansDir`      | directory                   | `docs/_plans`                                                                           |
| `name`          | RegExp over the filename    | `DEFAULT_NAME` — kebab-case, `refunds.md`                                               |
| `except`        | git pathspecs — not plans   | none; the folder's `README.md` is never a plan                                          |
| `sizing`        | RegExps                     | `DEFAULT_SIZING` — a number of hours, days, weeks, points                               |
| `phaseHeading`  | RegExp                      | `DEFAULT_PHASE_HEADING` — `## Phase` or `### Phase`                                     |
| `command`       | RegExp over a phase's lines | `DEFAULT_COMMAND` — `pnpm`, `npm`, `npx`, `node`, `bash`, `make` … or `**Acceptance.**` |
| `knownCheckIds` | check ids                   | the run's own roster                                                                    |

The four patterns are English, and exported, so a repository that plans in another language
starts from them rather than meeting a check that finds no phase and calls every plan
well-shaped. `knownCheckIds` defaults to **the run's own roster** — a list built by hand
could forget a check, and the forgotten check would be invisible to the audit meant to
notice it. There is no escape hatch for a plan that INTRODUCES a check: state that phase's
acceptance as the command that runs it until the check lands.

### `decisionLogShape`

One rule: a rejected alternative states **why** it lost. The separator is `—`, `--`, or
the word `because`.

```markdown
### Decision: results are ticked, never typed

- Rejected: a free-text amount — a typed number reconciles against nothing.
```

| Option   | Kind                    | Default            |
| -------- | ----------------------- | ------------------ |
| `docs`   | git pathspec, or a list | `docs/_plans/*.md` |
| `except` | git pathspecs           | none               |

## What fails and what passes

A clean pass prints what it read — `✓ plan-shape — 2 plan(s) examined, clean`. **A plans
folder that does not exist fails**, naming it, in `planStaleness` and `planShape` alike: a
`plansDir` left pointing at a folder that moved would otherwise report a clean lifecycle
forever. A folder that exists and holds no plan passes and says `nothing in flight`, which
is true — the plans' corpus floor is 0 unless `corpus: { atLeast: 1 }` says otherwise. An archive
that does not exist yet is a repository that has finished nothing, and is not a failure.
`decisionLogShape` fails a `docs` pathspec that matched no document (corpus floor 1), and
`planStaleness` fails when there are archived plans to cite and its `docs` matched nothing
to read. Every finding carries the file, and the line where there is one, and says what to
do.

**The ratchet.** Each check counts one kind of debt, and `ratchet: n` tolerates that many:

- `planStaleness` — plans that declare no status. Every other finding always fails;
- `planShape` — sizing mentions and phases with no acceptance, together. The filename, a
  nested folder and an unknown `--id` always fail;
- `decisionLogShape` — rejections with no reason.

A tolerated finding is still listed, under a line saying it is tolerated. The stored
threshold (`.specwarden/ratchets/`) wins over the one written inline, and `--tighten` moves
it to what a passing run measured.
