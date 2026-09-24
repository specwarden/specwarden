<!-- GENERATED from core/GLOSSARY.md. Edit the glossary. -->

# specwarden — glossary

Every word the product uses for itself, what it means, and the one name it goes by — in
the code, the options, the command line's output and every document. A word not here is
not a term; a second word for a term here is a defect, and the `vocabulary` check refuses
the retired ones listed at the end.

Read top to bottom once: each entry uses only the words defined above it.

---

## The product

**specwarden** — the engine, the npm package that ships it, and the command that runs it
(`specwarden check`, alias `spw`). Always lower-case. A repository declares its rules;
specwarden proves which hold.

**consumer** — a repository that uses specwarden. What it writes lives in its
**`.specwarden/`** directory: `config.mjs`, `rules.mjs`, `perimeter.mjs` and `checks/`.

**config** — `.specwarden/config.mjs`, exporting `defineConfig({ … })`. It names only
what the tree cannot say for itself: tiers, modules' spec sources, adapters, a reporter.

## Rules and checks

**rule** — a decision the consumer has made, in one sentence: its **statement**, and the
**owner** — the document that holds its reasoning (a path, a path `§ section`, a person
or team, or the package that ships it). A rule is either enforced or **not-mechanizable**,
which it says with the reason no check can hold it.

**rule register** — `rules.mjs`: the rules no single check states — one several checks
share, or one nothing can check. A rule held by exactly one check is written on that
check instead (`rule: '…'`).

**check** — the unit that judges one rule against the repository and returns a verdict.
One `<id>.check.mjs` file under `checks/` exports it; the engine finds it there, and the
file's name is its **id** unless the check names one.

**enforcer** — a check, or a perimeter policy, that a rule names as holding it
(`enforcement: { enforcedBy: ['no-todo'] }`).

**implied rule** — the rule a module's check carries when the consumer writes none,
owned by the module's package. It yields to the consumer's: a `rule` written on the check
replaces it, and a register entry naming the check drops it.

**orphan** — a check that enforces no rule. `orphan-check` reports it.

**family** — a folder under `checks/`: what a check is ABOUT (`docs/`, `ops/`,
`security/`). A module's checks go in the folder named after the module; checks the engine
builds around a repository's own tools (`lint`, `unit`) go in `workspace/`.

## What a check is made from

**primitive** — one of the engine's factories for a structural rule: `forbidPattern`,
`forbidImport`, `pathContract`, `siblingRequired`, `mustDeclare`, `referencesResolve`,
`regenerable`, `sourcesAgree`. Each is tested as part of the product.

**factory** — any function that builds a check: a primitive, `defineCheck` (a body of
your own), `fromResult` (a function you already have), `commandCheck` (a command line),
or a module's factory (`docPaths`, `secretScan`, …).

**preset** — a module's factory that builds all of its checks at once: `docsChecks`,
`plansChecks`, `opsChecks`. A preset applies `tier` and `when` to every check it builds.

**module** — an optional package of checks that carry an opinion a repository may not
share, installed one at a time: `@specwarden/docs`, `plans`, `ops`, `security`, `agents`,
and the spec-source modules `openspec` and `speckit`.

**plugin** — an optional package of one stack's conventions, declared against the
engine's primitives: `@specwarden/plugin-nestjs`. Listed under `plugins:` in the config.

**template** — a starting tree `specwarden init --template <name>` writes for one kind of
repository. **part** — one piece a template is assembled from (`@specwarden/scaffold-parts`).

**example** — a check a template writes switched off, as `<id>.check.mjs.example`, because
it needs a fact only the repository has. To **switch it on**: fill in what its header asks,
rename it to `.check.mjs`, uncomment its rule in `rules.mjs`.

## What a check says

**finding** — one statement a check makes: a **severity** (`error`, `warning`, `info`),
a message that says what is wrong and what to do, and the `file` and `line` it is about.
An `error` fails the check; the other two are reported and fail nothing.

**verdict** — what a check decides: `ok`, its findings, and — when it has them — what it
**measured** and why it could not look.

**result** — the engine's record of one check in one run: the verdict, how long it took,
and whether it was skipped. What a reporter renders.

**outcome** — what a check's own body returns before the engine makes a verdict of it:
findings, the count it **examined**, a measurement.

**cannot-tell** — the skip a check reports when what it examines is not on this machine
(`verdict.skipped: 'why'`). Never a pass, never a failure.

## What stops a check passing quietly

**corpus** — the tracked files a check examines. A primitive takes it as `files` and leaves
some out with `except`; a module names it by its role (`docs`, `code`). **examined** — how
many units of it a run looked at.

**corpus floor** — `corpus: { atLeast: n }`: how many units a run must examine for its
verdict to count. Below it the check fails — a check that examined nothing cannot fail.

**`paths` / `expect` / `refuse`** — on a `commandCheck`: the files it is pointed at
(verified first), what its output must show for a zero exit to be believed, and what its
output must not show.

## When checks run

**tier** — a named group of checks run together: `fast` (the default: only reads files)
and `heavy`, or the tiers a config declares. A CI job runs one tier.

**relevance** — whether a change could affect a check: its **`when`**, read against the
**changed set** — the files changed since the **base** (`--base <ref>`). A check the change
cannot affect is skipped as `not-relevant`.

**full run** — a run with no relevance filter: `--all`, a shared build input, a change too
wide, or an **unknown range** (a diff that cannot be read — a shallow clone, CI with no
base). A full run always says which of these made it one.

**advisory** — a check whose failure warns and never blocks. **exclusive** — a check that
must run alone under `--jobs`.

## Debt that cannot be paid today

**ratchet** — a bar that only moves one way. A check armed with `ratchet: n` tolerates the
**measured** count up to its **threshold** and fails beyond it; `--tighten` moves the
threshold to what a passing run measured, never past the **ceiling** the check declares.
A ratchet counts down (debt) unless it says `direction: 'up'` (a score that may only rise).
The thresholds are data in `.specwarden/ratchets/` — commit them.

## The engine auditing itself

**self-checks** — the checks the engine adds to every run to audit the declarations:
`rule-owner-resolves`, `rule-coverage`, `orphan-check`, `enforcement-resolves`,
`ratchet-direction`. Configured under `selfChecks`.

**zone** — who a check speaks for: `product` (the engine's and modules' own checks, true
of any repository) or `consumer` (the repository's own).

**capability** — what a check may touch: `read`, `write`, `exec`, `net`. A check reads the
world only through the **ports** its capabilities open — files, version control, processes,
the clock, a writer — and an **adapter** is one implementation of a port.

## Around the checks

**perimeter** — `perimeter.mjs`: what an assistant working in the repository may not do,
judged before the action runs by the `specwarden perimeter` hook. Each entry is a
**policy** (`commandPolicy`, `writePolicy`) with an id and a `why` that names what to do
instead. A policy is an enforcer a rule may name.

**spec source** — where a repository's requirements are written: `native` (its plans),
`openspec`, `speckit`. **requirement** — one entry a spec source reads. **deposited
invariant** — a marker in a document tying it to a requirement; `sync-invariants`
reconciles the two.

**plan** — a working document for unfinished work (one numbered file in `_plans/`), with a **status**
(`draft`, `active`, `done`), **phases** that each end in an **acceptance** command, and a
**harvest** list of what moves to a permanent document before the plan is archived or
deleted.

**reporter** — how a run is printed: `tty`, `json` (`--json`), `github` (annotations).

**gate** — not a check: a RUN of checks that decides whether a change may proceed — a CI
job, a pre-push hook, `pnpm gate` in this repository. The command line reports checks.

---

## Retired words

Each is a second name for a term above. The `vocabulary` check refuses them in code,
options and documentation.

| Retired                                    | Say instead                            |
| ------------------------------------------ | -------------------------------------- |
| `warden.config.mjs`, `IWardenConfig`       | `config.mjs`, `ISpecwardenConfig`      |
| SpecWarden, "the warden"                   | specwarden                             |
| gate(s), for one check                     | check(s)                               |
| harness, harness checks                    | self-checks                            |
| rule registry                              | rule register                          |
| `CheckRegistry`                            | `CheckRoster`                          |
| `commandRule`, `writeRule`, perimeter rule | `commandPolicy`, `writePolicy`, policy |
| `checkIds` in a rule's enforcement         | `enforcedBy`                           |
| `ratchetId`, `ratchetDirection`            | `ratchet: { id, direction }`           |
| schedule, for a tier                       | tier                                   |
| floor, for a rising ratchet                | a ratchet with `direction: 'up'`       |
| arbiter                                    | CI                                     |
