# specwarden

The quality-gate harness this repository runs on. **A gate IS a file** —
`.specwarden/checks/<family>/<id>.check.mjs` — and the engine discovers it; the pre-push
hook, every per-push CI job and the nightly run all invoke
`packages/specwarden/core/bin/warden.mjs check`, reading `.specwarden/warden.config.mjs`
for what the tree cannot say for itself. `.specwarden/registry/registry.mjs` exports the
roster the engine assembled, for the tests and documents that address it by name.

To run gates by hand: `pnpm gate:fast`, `pnpm gate --id <gate>`, `pnpm gate --tier heavy`
(the `gate*` aliases are this engine). `pnpm spw doctor` prints the check roster, the
capability manifest, ownership and rule coverage.

## Two zones — the rule everything rests on

- **Product zone `packages/specwarden/core/src/`** is repository-agnostic: it names no host
  literal (`be/`, `drizzle`, `gap`, …) and never imports the consumer zone. It would
  survive being extracted to its own package and dropped into another repo. The
  `zone-boundary` check enforces this on every push.
- **Consumer zone `.specwarden/`** holds everything that knows THIS repo: which gates
  exist, which trees are the product, which tokens are the host, the declared rules,
  the perimeter, the relevance triggers, and every check body. Repository knowledge lives
  here and nowhere else.

  That last clause became TRUE on 2026-09-04. Until then the gate list, the relevance table
  and sixteen check bodies sat under `scripts/`, so the zone this section described was
  spread across three directories and a reader looking for "where the gates are" found the
  answer in whichever place they searched first. `scripts/README.md` states the boundary
  from the other side.

The dependency is one-way: the consumer reaches into the product, never the reverse.

## Where things live

| You want to… | Do |
| --- | --- |
| add a gate | `specwarden new <id> [--family <folder>]` — it writes the body and its test. **No config edit registers a check**; a file under `checks/` IS one, and a file there exporting no check is a hard load error, never a skip |
| write the body | `defineCheck({ … , run: ctx => findings })` from the engine. It owns the zone, the capabilities, the contract version, the `ruleId` on every finding, the verdict, the ratchet framing and the line a passing run prints |
| carry an existing plain function unchanged | `fromResult({ … })` — it takes `{ errors }`/`{ failures }`/`{ notes }` in the shapes such functions already return |
| express a structural rule without a body | a primitive: `forbidImport`, `forbidPattern`, `mustDeclare`, `pathContract`, `siblingRequired`, `referencesResolve`, `regenerable`, `sourcesAgree` |
| wrap a shell command | `commandCheck({ cmd, … })`. Declare `paths` when the command is pointed at exact files, and `expect`/`refuse` when a zero exit would not prove it did anything |
| let a check repair itself | `fix: ctx => …` on `defineCheck`/`fromResult`, or `fixable: true` on `regenerable`. Only where the correct content is derivable — a stale generated artifact, never a judgement |
| stop a check hanging the run | `timeoutSec`. It ends the WAIT and names the check; killing a subprocess is that command's own `timeoutSec`, and a synchronous busy loop is interruptible by nothing |
| get annotations instead of terminal text in CI | nothing — `--reporter github` is selected automatically under Actions. `--reporter tty` overrides it |

A fix runs only on a failing check and the check is re-run afterwards, so what is reported
is what REMAINS rather than what was attempted.
| declare the rule a check enforces | `rule: { statement, owner }` ON THE CHECK — it joins the register enforced by that check. `.specwarden/rules.mjs` is for the rules that belong to no check: the not-mechanizable ones, and enforcers that are not checks |
| test a check | `runCheck(check, { tree, tracked, ratchet, exec })` from the engine's testing kit; `errorsOf(verdict)` for the assertion you actually want |
| add a stack convention as a plugin | a package under `packages/specwarden/plugins/`, wired from the consumer's config (a plugin declares checks; it never supplies a port adapter) |
| add a forbidden-command / write rule | `.specwarden/perimeter/perimeter.mjs` — the PreToolUse hook calls the engine's `perimeter` entry, which evaluates that file. A rule added there takes effect, and `.specwarden/perimeter/perimeter.test.mjs` is where its blocked-and-allowed cases go |
| move a debt floor | `specwarden check --id <gate> --tighten`. The file under `.specwarden/ratchets/` only travels towards its target, and the check's own `ratchet: <n>` is the ceiling the at-rest audit holds it against |
| declare which changes defeat the relevance filter | `.specwarden/relevance/relevance.mjs` (a migration, the schema, the SSE seam, edge routing, or a diff too wide for any predicate) |
| add a script a PERSON runs | not here — `scripts/tools/`, and `scripts/README.md` says why |

*This table described the pre-2026-09-05 world until 2026-09-22 — three of its rows told a
reader to add a registry entry, set `native: true` and import the body into the config, all
of which had been deleted when the tree became the source. The first thing a new consumer
reads was an instruction to do the thing that no longer exists.*

## The engine, briefly

- **Ports and adapters.** A check reads the world only through injected ports
  (`files`, `vcs`, `proc`, `clock`, `writer`), gated by the capabilities it declares —
  a check with no `write` capability has no writer. This is what makes a check testable
  against an in-memory tree and unable to reach anything it did not ask for.
- **Relevance.** A check runs when the changed-file set matches its `when()`, or when a
  shared build input changed (`sharedBuildInputs` → run everything), or when the diff is
  wider than `fullRunTriggers` (files/lines — the second, weaker sieve), or when the range
  is unknown (run everything — fail-safe). Every route to a full run returns a REASON,
  which the CLI prints: a full run that cannot say why it is one is indistinguishable from
  a tier nobody ever filtered.
- **The shim.** `bin/warden.mjs` is build-free and runs the compiled `dist/`. It refuses
  a stale build: it compares a content fingerprint of `src/` against the stamp the build
  writes, so an edit to `src` without a rebuild fails loudly rather than running old
  code. `prepare` builds `dist` on `pnpm install`.
- **Mutation-tested.** The built-in checks and primitives are mutation-tested nightly
  (`mutation-score`): a check whose tests would not notice its own code breaking is the
  failure mode the whole harness exists against.

## What a green run does and does not prove

A check's exit code and a check's verdict both answer "did I fail". Neither answers "did I
look at anything", and the difference is where every silent-success defect on this
repository's record lives — a package filter that matched no package, a path filter that
matched no file, a mutation config whose globs instrumented nothing, a pattern that stopped
matching after a format changed. In each case the gate ran, examined nothing, found nothing
wrong and reported green, for months.

Three declarations close the family, and each is one line:

- `corpus: { atLeast: n }` on `defineCheck` — a run that examined fewer units than that is a
  hard failure, not a pass. The body reports what it saw as `examined`.
- `paths: [...]` on `commandCheck` — the files the command is pointed at are verified through
  the file port BEFORE it is spawned, because a test runner handed a path it cannot find
  runs the rest and exits 0.
- `expect` / `refuse` on `commandCheck` — what the output must contain for a zero exit to be
  believed, and the phrases a tool prints when it silently did nothing.

None of them is on by default: only the check knows what its own corpus should look like.
All of them are cheaper than the incident.

## One fact, one place

The engine's recurring lesson, applied three times and each time after the drift had
already happened:

- **the gate list** was a hand-kept array beside a tree the engine could read. Now a
  check is a file, and a file under `checks/` that exports no check is a load error.
- **the ratchet ceilings** were a map in the consumer's config mirroring a literal each
  check already declared. Now `ratchet-direction` reads them off the roster.
- **the constraint card** — the prohibitions re-injected into every session — was
  hand-written beside a register that marked its own rules irreversible. Measured on
  2026-09-23: seven in the register, thirteen on the card, two register rules that never
  reached the card (one of them the prohibition on destroying a volume by subcommand),
  and six card lines with no rule behind them anywhere. `generateConstraintCard` emits
  the card from the register, and a `regenerable` gate refuses a card that has drifted.

A rule may be declared on the check that enforces it, and the same id in both places is
refused at load. There is no correct merge: two copies are equally entitled, and picking
one silently is how the other's wording stops being true without ever being deleted.

## The spec seam

`IWardenConfig` accepts `specSource` (where requirements come from) and `invariants`
(which documents hold deposited invariants, and the pattern whose first group is an id).
This repository sets **both**, and the two together are what makes `spec-corpus` able to say
that every deposited marker resolves against a live requirement.

A green `specwarden sync-invariants` is still not evidence — the command returns 0 in every
branch by design, including when it finds no source at all. What decides is the `spec-corpus`
gate. `ownership` in `.specwarden/warden.config.mjs` names this engine the owner of
`invariants`, and that ownership is now backed by an artifact rather than declared ahead of one.

The seam is exercised from the other side too: the `openspec` and `speckit` templates each
write a `spec-source.mjs` and wire it, and their tests load it and call both halves. A
repository specified in either tool gets the reconciliation on day one.

**`.specwarden/perimeter/perimeter.mjs` was the other thing declared ahead of its artifact, and it is now LIVE.** The cutover landed on
2026-09-04: the PreToolUse hook calls the engine's `perimeter` entry, which evaluates that
file, and the guard script that used to hold the rules is deleted. `enforcement-resolves`
resolves the ids `.specwarden/rules.mjs` names against BOTH the check registry and that
file, so a rule renamed there stops resolving and fails a gate.

Writing the cases first is what made the switch safe, and it was not a formality: the rules
had been described as ported verbatim, and seven of the 51 verdicts differed — six false
positives on `docker exec` and one hole under a herestring. A port is identical when
something asserts it, and not before.

Why that check had to exist: `rule-coverage` counted those five as enforced purely because
they NAME ids, without resolving them, and `orphan-check` only walks check → rule. Two green
meta-checks over an inert file, on the five rules marked `irreversible`.

## Build and test

`pnpm --dir packages/specwarden/core run build` (esbuild bundle + `tsc` declarations),
`pnpm --dir packages/specwarden/core test` (vitest), `pnpm --dir packages/specwarden/core run
test:mutation` (stryker, slow).

**In CI these are the `lint-specwarden` and `specwarden-unit` gates, added 2026-09-04.**
Before then this package was verified per-push by nothing: `lint-packages` and
`packages-unit` name `@app/contracts` and `@app/i18n` by explicit filter — deliberately,
so a wrong filter cannot match nothing silently — and `specwarden` is neither. Only the
nightly `mutation-score` touched it, and the `build` gate typechecked it as a side effect
of emitting declarations. The engine that decides whether any gate runs is the last thing
that should be on that footing.

## What this package may never know, and what a consumer owes it

The engine is written to be lifted out. Whether it ever is does not matter — what the
constraint buys is that a rule cannot quietly acquire a dependency on one repository's
shape, which is how a check stops being a rule and becomes a habit.

**It may never know:** a workspace name, a directory layout, an ORM, a framework, a domain
noun, a branch name, a file that exists only here. `zone-boundary` fails a source that names
one — comments included, because a doc comment illustrating a rule with a local path is the
same claim in a quieter voice.

**A consumer owes it four things**, and nothing else:

| The consumer supplies | Because |
| --- | --- |
| `.specwarden/warden.config.mjs` | the engine finds its configuration at a fixed path (`CONFIG_DIR` in `src/runtime/cli/_shared/find-config/find-config.util.ts`) and has no other way in |
| the checks, as files under `checks/`, each with a tier and a predicate | which checks exist and when they matter is a fact about a project's own risk |
| every check's parameters — paths, modes, vocabularies, thresholds | a factory is portable exactly because the values are not baked into it |
| the ratchets, as files | a measured debt or floor belongs to the tree that has it |

**What it does NOT ask for:** a build step of its own in the consumer, a plugin registry, a
list of its own checks, a second copy of any threshold, or any knowledge of how the host runs
its CI. A gate is spawned as a command or run in process; the engine refuses at load time to
register one that is neither, and refuses a file under `checks/` that exports no check at all
— a silent skip there would look exactly like coverage.

Three of those used to be owed and are not any more, and each stopped being owed for the same
reason: it described the engine rather than the repository, so every consumer wrote it out
again and one of the copies drifted. The list of checks became the folder. The hundred lines
of self-check wiring became defaults. The map of ratchet ceilings became the checks' own
declarations, read off the roster.

### Before this could be published

Two things are missing, and they are named here rather than in a plan, so they are not
rediscovered:

- **`private: true` and `version: 0.0.0`.** Publishing means owning a version line and a
  changelog, which is a commitment nobody has made yet.
- **No consumer other than this repository has ever loaded it.** Everything here is
  portable by construction and by `zone-boundary`, not by demonstration — the first real
  extraction will find something, and that is the point of writing the contract down now.

`invariants` left this list on 2026-09-22: it is wired, the corpus deposits under a pattern,
and `spec-corpus` resolves every marker against a live requirement. The entry had already
outlived its subject by the time it was removed, which is the ordinary fate of a list of
what is missing — it is written when the gap is felt and read long after it is closed.
