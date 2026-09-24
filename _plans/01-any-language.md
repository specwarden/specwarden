# 01 — specwarden in a repository of any language

**Status:** draft

A Go, Python or C++ repository should be able to adopt specwarden without adopting
JavaScript: first without a `package.json`, then without Node, and last without writing a
line of JS. The engine already judges any tree — it reads files and runs commands — so
this plan changes how the engine is **reached and fed**, not what it is.

The order is the order in which each obstacle stops a real team:

| Stage | After it, a Go/Python/C++ team…                                          | Phases                                   |
| ----- | ------------------------------------------------------------------------ | ---------------------------------------- |
| A     | runs `npx specwarden` with no manifest; gets a tuned template            | 1–5                                      |
| B     | installs one binary; Node is not required at all                         | 6–7                                      |
| C     | declares checks as data, or in Python, Go or shell; writes no JavaScript | `_plans/04-checks-without-javascript.md` |

## What this plan rests on — measured 2026-09-24

A scratch Go repository (`go.mod`, `cmd/`, `internal/`, a README), driven by
`core/bin/specwarden.mjs` from this checkout:

- `adopt`, `suggest` and `init` run and write `.specwarden/`. `adopt` reports
  `package manager: unknown`, `test runner: unknown`; `suggest` finds nothing; `init`
  writes no check, because `availableModules` reads `package.json` and there is none.
- The first `check` exits **2** — the config failed to load with
  `Cannot find package 'specwarden'`. The config `init` itself wrote imports a name
  nothing can resolve (`core/src/runtime/cli/run-cli/run-cli.command.ts`, the `import()`
  of the config).
- With a hand-made `package.json` and `node_modules/specwarden` linked in:
  `forbidPattern` over `**/*.go` caught `panic(` (exit 1), and `commandCheck` wrapping
  `go vet ./...` ran. **The engine is language-neutral already; only its entrance is not.**
- `forbidPattern` did NOT see a violating file until it was `git add`ed — primitives read
  `vcs.trackedFiles`, and nothing in the output says an untracked match was skipped.
- `forbidImport` extracts specifiers with one JS/TS grammar (`IMPORT_RE`,
  `core/src/primitives/_shared/import-specifier/`); a Go or Python import is invisible to it.
- `specwarden new` writes a test run by `node --test`, which imports `specwarden` and hits
  the same wall as the config.
- Speed is not a reason for any of this: on this repository `gate:fast` is 15 s, of which
  typecheck, format and lint are 12 s; the engine's own start-up is about 0.2 s. No phase
  here is justified by performance, and the standalone binary is not expected to be faster.

## Invariants every phase keeps

- **`core` still depends on nothing.** Whatever bundles modules and templates together is
  a distribution built _on_ core, never core itself (`skills/structure/SKILL.md`).
- **The engine that runs is the engine the checks import.** Two copies in one process —
  one running, one building check objects — is a contract mismatch nobody can see.
- **No silent skip on a new path.** A file the loader will not read, a toolchain that is
  absent, a format that is not supported: each is a named error, never an ignored file.
- **Nothing printed names a file the consumer does not have** (router rule 6).
- Every check or refusal added here is **seen red** on its defect before it is believed.

---

## Phase 1 — the engine resolves its own name

A consumer tree with no `package.json` loads, runs and tests.

- **A resolution seam in core, runtime-agnostic.** A pure function answers "what does
  bare specifier `s`, imported from `parent`, resolve to" given the set of packages the
  running engine can supply. Core's own set is itself (`specwarden`); a distribution may
  pass more. The function is tested alone; installing it is the host's job.
- **The Node host installs it** with `module.registerHooks` (in-thread, synchronous,
  present in Node 24) before the config is imported. Order: the consumer's own resolution
  first; then, only for `specwarden` and the `@specwarden/` scope, the engine's own
  install location (this is what makes `npx -p specwarden -p @specwarden/security` work,
  since npx installs them side by side). Anything else unresolved stays the error it is.
- **Local wins.** When the repository resolves its own `specwarden` and it is not the
  one running, the bin delegates to it (an env marker prevents a loop). This is what
  keeps the invariant above true when a global or npx engine meets a pinned local one.
- **`specwarden test [paths]`** runs the consumer's `*.check.test.mjs` through
  `node:test`'s `run()` in-process (`isolation: 'none'`), with the seam installed, so the
  test `new` writes runs in a repository that has no manifest. `new` then prints
  `specwarden test <file>` instead of `node --test <file>`.
- The load error for an unresolved `@specwarden/*` says what to do in a manifest-less
  repository, generically — it names the package that failed, not a list of modules.
- Any warning Node prints for the hook API is not passed to the consumer.

Before: `contract-architect` — a new CLI command, a new resolution behaviour, and the
seam's name. Watched red first: a core playground case "a repository with no manifest",
failing today with the measured message.

```bash
pnpm --filter specwarden exec vitest run src/runtime/cli
pnpm --filter specwarden exec vitest run _playground
pnpm gate
```

## Phase 2 — an untracked match is said, not skipped

The verdict does not change; the pass note does. When a primitive's pathspec matches
files git does not track, the note says how many and that `git add` includes them.

- The VCS port gains the untracked listing (`git ls-files --others --exclude-standard`);
  the fake gains the same, and `core/src/infrastructure/_contract/` runs both through the
  same cases (router rule 4).
- `trackedCorpus` carries the count; every primitive's pass note prints it when non-zero.
- `core/GUIDE.md` §5 states the behaviour — today no document does.

Before: `gate-author`, on whether any primitive's note becomes noisy.

```bash
pnpm --filter specwarden exec vitest run src/infrastructure src/primitives
pnpm gate
```

## Phase 3 — the engine recognises Go, Python and C++

`adopt` and `init` report what they see in a non-JS repository instead of "unknown".

- `IRepoShape` gains the toolchains found, each from the one file that proves it:
  - Go: `go.mod` (and `go.work` for a workspace); tests present when `*_test.go` is tracked;
    `.golangci.yml` when a linter is configured.
  - Python: `pyproject.toml`, `setup.cfg`, `setup.py`, `requirements*.txt`; the manager from
    `uv.lock`, `poetry.lock`, else pip; pytest, ruff and mypy from their table headers in
    `pyproject.toml` or their own config files. Headers only — no TOML is parsed in this
    phase, and nothing is guessed from a dependency name alone.
  - C/C++: `CMakeLists.txt` (with `enable_testing`), `meson.build`, a root `Makefile`;
    `.clang-format` and `.clang-tidy` when present.
- `ITemplateContext` carries the same facts, so a part can decide from them.
- `adopt` prints them; `init`'s `Detected:` line names them and, where a template for
  the toolchain exists, suggests `--template <name>`.
- `suggest` gains per-toolchain candidates measured at the existing 0.9 threshold — first
  "every Go package directory has a `_test.go`".

Before: `contract-architect` — `IRepoShape` and `ITemplateContext` are exported.

```bash
pnpm --filter specwarden exec vitest run src/runtime/cli/adopt src/runtime/cli/init src/runtime/cli/suggest
pnpm gate
```

## Phase 4 — `forbidImport` reads other languages' imports

A layer rule ("`internal/handlers` may not import `internal/db`") is the first structural
check a Go or Python team wants, and today it silently examines nothing useful.

- An option naming the import syntax — `js` (today's grammar, the default), `go`
  (`import "p"` and grouped blocks), `python` (`import a.b`, `from a.b import c`, relative
  forms), `c` (`#include <x>` and `"x"`). One extractor per syntax beside `IMPORT_RE`, each
  with its own spec of forms it must and must not see.
- A syntax that does not match the corpus's extensions is a load-time refusal, not a
  clean run over files it cannot read.

Before: `contract-architect` (a new option on a published factory); `gate-author` for the
grammars' blind spots.

```bash
pnpm --filter specwarden exec vitest run src/primitives/forbid-import src/primitives/_shared
pnpm gate
```

## Phase 5 — templates `go`, `python`, `cpp`

`init --template go|python|cpp` writes a tree that is green on a clean repository and red
on each defect it exists for.

- **Parts** in `templates/_parts`, each written only where its subject exists:
  - `go-toolchain` — `go vet ./...`; `go test ./...` only when a `_test.go` is tracked,
    with `expect` on an `ok` line (a tree of packages with no tests exits 0);
    `gofmt -l .` with a `refuse` on any listed file, because **gofmt exits 0 when files
    are unformatted** — the purest silent green in this plan.
  - `python-toolchain` — `ruff check` with a `refuse` on its "no Python files" warning;
    `pytest` with `expect` on a passed count (pytest already exits 5 when nothing is
    collected, and the part says so rather than relying on it silently); `mypy` only when
    configured.
  - `cpp-toolchain` — `ctest --test-dir <build> --no-tests=error` when CMake enables
    testing; `clang-format --dry-run --Werror` only when `.clang-format` exists.
  - Every `refuse` and `expect` pattern names the toolchain version it was read from, in
    the part's docblock; the playground proves it against the version CI pins.
- **Templates**: each composes `secret-scan`, `doc-paths` and its toolchain part. Registry
  entries, generated README, `SKILL.md`, `_playground/repository/` modelling a real module
  of that language, and `playground.spec.ts` proving every check red.
- **CI**: the heavy job installs Go, Python with ruff and pytest, CMake with a compiler and
  clang-format, at pinned versions. A contributor without a toolchain sees the playground
  proof red with the missing command named — not skipped.

Before: `template-author` for the parts and playgrounds; `contract-architect` for the
three new published names.

```bash
node scripts/playgrounds.mjs --write go
node scripts/playgrounds.mjs --write python
node scripts/playgrounds.mjs --write cpp
pnpm gate --id playgrounds --id package-playgrounds --id scaffold-drift
pnpm gate
```

## Phase 6 — one binary, no Node

A standalone executable carries core, every module, the plugin and every template.

- **Where it lives.** A private workspace package (not published to npm) that depends on
  every other package and builds the binary — so `core` still knows none of them. Its
  place in the registry is decided against `skills/structure/SKILL.md` §5 first.
- **It supplies everything.** It passes phase 1's seam the full set, so `@specwarden/*`
  imports and `init --template <any>` resolve with no install. `availableModules`,
  `installedTemplates` and a template's `requires` read the supplied set, not only a
  manifest.
- **The runtime is decided by measurement, first thing in the phase**, between Node's
  single executable applications and `bun build --compile`, against these questions:
  can the entry `import()` a `.mjs` file from disk; can it install the resolution seam;
  does `spawnSync` of a shell command behave as on Node; can every target be produced in
  CI; binary size; cold start against the 0.2 s measured today. The answers, and the
  losing option's reason, are written into this plan before the build is written.
- **Local wins here too**: a binary run in a repository that installs its own
  `specwarden` delegates to it.
- The bin's stale-build refusal is replaced, in the binary, by the version and source
  hash stamped at build time; `specwarden --version` prints core's and every bundled
  package's version.
- **Proof**: the root playground and the three new templates' playgrounds run against the
  built binary with no `node` on `PATH`.

Before: `contract-architect` (a new distribution of the published verdicts), then
`adversarial-reviewer` on the runtime decision — the binary's runtime is the one the
consumer's verdicts are computed on.

```bash
node scripts/standalone.mjs --build
node scripts/standalone.mjs --prove
pnpm gate
```

## Phase 7 — where a non-JS team gets it

- A release workflow builds linux-x64, linux-arm64, darwin-x64, darwin-arm64 and
  windows-x64 on native runners; publishes them to GitHub Releases with SHA-256 sums and
  build-provenance attestations. The tool runs in somebody's pre-push, so what they
  download must be provably what CI built.
- Channels, each generated from one release manifest: a Homebrew tap formula, a Scoop
  manifest, PyPI platform wheels carrying the binary (`pipx install specwarden`) — the same
  distribution whose pure wheel is plan 04's Python SDK, which never depends on them — and a
  GitHub Action `setup-specwarden` for every language's CI. Go has no channel of its own —
  `go install` builds Go sources — and is served by the other four.
- npm stays as it is: the `specwarden` package is still the Node path.
- **Decisions that are the user's, not this plan's**: owning the PyPI name, creating the
  tap and bucket repositories, and whether to sign and notarize the macOS binary and sign
  the Windows one (unsigned, a browser download meets Gatekeeper and SmartScreen).

Before: `release-manager` for the workflow and artifacts; `adversarial-reviewer` before
the first real publish, through `/release`.

```bash
node scripts/standalone.mjs --package --dry-run
pnpm gate --id publishable
pnpm gate
```

---

## Decisions

### Decision: the core stays TypeScript; the entrance changes

- Rejected: rewriting core in Rust, Go or C++ — the measured bottleneck is the wrapped
  tools, not the engine, and every check a consumer writes is JS, so a native core would
  have to embed a JS runtime or break the check contract.
- Rejected: a native hot path (napi-rs) now — no profile shows a hot path; revisit when a
  consumer's repository does.

### Decision: resolution is a seam in core, installed by the host

- Rejected: telling non-JS teams to add a `package.json` — the measured first run is an
  exit 2, and "add a manifest for a tool" is the step at which a Go team stops.
- Rejected: rewriting consumer imports on disk to absolute paths — it edits files the
  consumer owns, and the rewrite breaks the day the engine moves.
- Rejected: resolving any unresolved bare specifier from the engine's location — only
  `specwarden` and its own scope, because a fallback for everything would quietly satisfy
  a consumer's missing dependency with whatever happens to sit beside the engine.

### Decision: local wins over global

- Rejected: always running the invoked engine — a global engine loading checks built
  against a pinned local one runs two contracts in one process.

### Decision: untracked matches are reported, not judged

- Rejected: failing on untracked matches — a scratch file would redden a local run while
  a clean CI checkout stays green, two verdicts for one commit, which the one-list
  principle exists against.

### Decision: templates before declarative checks

- Rejected: making the new templates wait for plan 04 so they are born TOML — it holds the
  most-wanted piece behind the largest one, and plan 04 switches them by regenerating them.

### Decision: the binary bundles every package

- Rejected: a binary of core alone that downloads modules on demand — a network fetch in
  a pre-push is a failure mode, and what a check imports would then depend on the day.

### Decision: the runtime of the binary is measured, not assumed

- Rejected: choosing now between Node's single executable applications and Bun — the
  deciding facts (disk `import()`, the resolution hook, spawn behaviour, cross-targets) are
  unverified here, and a guess at them is what phase 6 would then be built on.
- Rejected: `deno compile` and `pkg` — Deno reaches npm through a compatibility layer, a
  third runtime to prove verdicts on; `pkg` is no longer maintained.

## Risks this plan carries

- `module.registerHooks` is not yet marked stable in Node 24; phase 1 pins its behaviour
  with a playground case so a Node change is a red run, not a surprise.
- A toolchain's message text is an API nobody promised: a `refuse` pattern rots when
  gofmt, ruff or ctest rewords. Mitigated by proving each against the CI-pinned version and
  naming that version beside the pattern.
- A binary on Bun computes verdicts on a runtime the unit suites do not run on; phase 6's
  proof runs the playgrounds on the binary itself for exactly that reason.

## Harvest

| Fact                                                                             | Goes to                                                               |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| the engine that runs is the engine the checks import; local wins                 | `core/SKILL.md`                                                       |
| the resolution order and the scope-only fallback, with its reason                | docblock of the resolution seam; `core/GUIDE.md` §1                   |
| primitives read tracked files; untracked matches are counted, and why not judged | `core/GUIDE.md` §5                                                    |
| gofmt exits 0 on unformatted files; ruff and ctest print, not fail, on nothing   | the toolchain parts' docblocks                                        |
| the binary's runtime, the measurements that chose it, the loser's reason         | docblock of the standalone build script; `skills/publishing/SKILL.md` |
| where a non-JS team installs from, and who owns each channel's name              | `skills/publishing/SKILL.md`; `CONTRIBUTING.md`                       |
| the toolchains CI installs, and why a missing one is red                         | `CONTRIBUTING.md`                                                     |
| each consumer-visible phase                                                      | its changeset                                                         |
