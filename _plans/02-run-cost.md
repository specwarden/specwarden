# 02 — what a run reads, what it costs, and what it leaves behind

**Status:** draft

Measuring where a run's time goes turned up two defects before it turned up a speed-up: a
tracked file the engine silently does not read, and processes a timed-out check leaves
running. Those come first, because a faster run that is wrong, or that leaves the machine
busier after it than before, is not an improvement. Then the costs, each measured before
and after, in the order of what they are worth.

## What this plan rests on — measured 2026-09-24, on this repository, Windows, 24 cores

Engine-only checks (the 18 fast-tier checks that wrap no tool), warm cache, counted by a
preload that wrapped `spawnSync` and `readFileSync`:

| Measure                          | Value                                                   |
| -------------------------------- | ------------------------------------------------------- |
| wall time                        | 2.2–2.9 s                                               |
| `git ls-files` spawns            | 36, of which 33 distinct pathspecs; 1.0–2.0 s in total  |
| one `git ls-files` of everything | 47 ms, 868 files                                        |
| `readFileSync`                   | 1541 over 689 files — **847 redundant**; 250 ms, 4.7 MB |
| `statSync` + `existsSync`        | 3430 calls                                              |

The whole fast tier with `--all`, on a machine also running another project's suites:
`--jobs 1` 114 s, `--jobs 8` 58 s. Noisy; it proves the lanes overlap, not by how much.

And the defects:

- **A non-ASCII file name is skipped, green.** A tracked `cmd/app/паника.go` containing
  `panic(` passed a `forbidPattern` over `**/*.go` with exit 0. `git ls-files` printed it
  as `"cmd/app/\320\277…"` (git's default `core.quotePath`), the file port could not read
  that name, and the primitive's `tryRead → continue` dropped it without a word.
  `trackedFiles`, `changedFiles` and `changedLineCount` all split git's quoted output on
  newlines (`core/src/infrastructure/git-vcs/git-vcs.adapter.ts`).
- **A timeout ends the wait, not the work.** `scripts-unit` hit its 300 s limit under
  `--jobs 4`; its `vitest` and a `git add --all` beneath it were still alive minutes later.
  `runAsync` kills only the shell it spawned; `withDeadline` says in its own message that it
  abandons the check without ending anything; `regenerable` runs a timed command through
  `spawnSync`, which also kills only the direct child.
- **Test repositories leak git daemons.** Git for Windows ships `core.fsmonitor=true` in
  its system config. Every temporary repository a spec or playground creates starts a
  `git fsmonitor--daemon` that outlives it: 145 were running. A serial overnight run
  (`--workspace-concurrency=1`) was found hung in a playground's `git add --all` — so the
  hang is not caused by `--jobs`.
- `ctx.changed` reaches every check and no primitive or module reads it.

## Invariants every phase keeps

- **No verdict gets greener.** A phase that makes a run faster by reading less must prove
  it reads the same files; a phase that makes a check read MORE (phase 1) is a fix, and its
  changeset says so in its first line (`.changeset/README.md`).
- **A real adapter and its fake agree** (router rule 4): every cache or new listing goes
  through `core/src/infrastructure/_contract/`, both sides.
- **Output order stays the registry's**, whatever runs in parallel.
- **Every speed claim is a before/after number from phase 4's report**, on the same
  repository, not an estimate.

---

## Phase 1 — every tracked file is read, whatever its name

- `trackedFiles`, `changedFiles` and `changedLineCount` read git with `-z` and split on NUL.
  No quoting, no dependence on the consumer's `core.quotePath`, and names holding a
  newline, a tab or a quote survive too.
- A file a listing names and the file port cannot read is **counted and named** in the
  pass note, never dropped silently. This is the class guard: the quoting bug is one way to
  produce such a file, and a deleted-but-staged file is another.
- The VCS contract suite gains the names that diverged: Cyrillic, CJK, a space, a quote,
  a leading dash. The fake must answer them identically.

Watched red first: the measured repro, as a core playground case — a tracked non-ASCII
`.go` file containing the pattern, green today.

Before: `contract-architect` — verdicts change (a check starts refusing a tree it accepted);
the changeset calls it a fix.

```bash
pnpm --filter specwarden exec vitest run src/infrastructure src/primitives
pnpm --filter specwarden exec vitest run _playground
pnpm gate
```

## Phase 2 — a deadline ends everything the check started

- **The async runner ends the tree.** On POSIX it spawns the shell as a process-group
  leader and signals the group — `SIGTERM`, then `SIGKILL` after a grace period. On
  Windows it runs `taskkill /pid <pid> /T /F`.
- **The runner's deadline aborts, not abandons.** An abort signal travels from
  `withDeadline` through the check context into every command the check spawned; the
  message stops saying the work may still be running, because it no longer may.
- **A timed command never runs synchronously.** `regenerable` moves to the async path;
  the sync `run` refuses `timeoutSec` (a deadline it cannot enforce is a promise it breaks).
- **Nothing outlives the CLI.** The process adapter keeps the live set; on exit — normal,
  signal or crash — it ends what is left.

Watched red first: a command check whose shell starts a grandchild that sleeps past the
timeout; the spec asserts that grandchild's pid is gone after the verdict. Red today, on
Windows certainly and on POSIX through the `pnpm → node → vitest` chain.

Before: `gate-author`, on every way a process escapes a group.

```bash
pnpm --filter specwarden exec vitest run src/infrastructure/child-process-runner src/runtime/runner
pnpm gate
```

## Phase 3 — a test repository starts no daemon

- One helper creates every temporary repository — the VCS contract spec,
  `scripts/playgrounds.mjs`, `_playgrounds/journeys/e-cli.spec.ts` and any other `git init`
  under test — and sets `core.fsmonitor=false` in the new repository's own config.
- A check in this repository forbids `git init` in a spec or script outside that helper,
  so the next test that makes a repository cannot forget.
- The engine's own `GitVcs` is unchanged: fsmonitor in a consumer's real repository is the
  consumer's choice.

Watched red first: the guard check against today's three call sites.

```bash
pnpm --filter specwarden exec vitest run src/infrastructure/_contract
pnpm gate --id scripts-unit --id unit
pnpm gate
```

## Phase 4 — a run reports its own cost

`specwarden check --cost` prints, per check and in total: processes spawned and their time,
files listed, files read and bytes, repeated reads, and time inside each port. Built as
counting decorators on the ports the container already assembles — no check changes, and
the numbers are the engine's own, not a profiler's guess.

This is the measuring stick for phases 5–8, and it is what a consumer shows when they say
the engine is slow — the evidence the "no native hot path yet" decision is waiting for.

Before: `contract-architect` — a new CLI flag.

```bash
pnpm --filter specwarden exec vitest run src/runtime/cli/check src/runtime/container
node core/bin/specwarden.mjs check --all --cost
pnpm gate
```

## Phase 5 — one git listing per run

- `GitVcs` lists everything once per run (`git ls-files -z`, lazily, on first use) and
  answers each pathspec with `matchPathspec` — the matcher the contract suite already holds
  equal to git.
- A pathspec with magic (`:(exclude)`, `:(icase)` …) still goes to git: the in-process
  matcher claims only what the contract proves.
- The listing lives for one run and is dropped after any `--fix`.
- The contract suite runs every case twice against one adapter instance — a cached answer
  must equal a fresh one.

Acceptance is a number: on this repository's engine checks, `--cost` shows at most a
handful of git spawns where it showed 36.

```bash
pnpm --filter specwarden exec vitest run src/infrastructure
node core/bin/specwarden.mjs check --all --cost
pnpm gate
```

## Phase 6 — one read per file per run

- `NodeFileSource.read` stops doing `existsSync` + `statSync` + `readFileSync` and reads
  once, mapping `ENOENT` and `EISDIR` to the port's own error.
- Contents are kept for the run, bounded by total bytes, and a write through the writer
  port drops the entry it replaced — the container wires the two, so no check can see a
  stale file after a fix.
- The file-source contract suite gains: a read after a write sees the write; a bound that
  is exceeded evicts rather than fails.

Acceptance: `--cost` shows zero repeated reads where it showed 847.

```bash
pnpm --filter specwarden exec vitest run src/infrastructure
node core/bin/specwarden.mjs check --all --cost
pnpm gate
```

## Phase 7 — a command is given only the files that changed

The wrapped tools are where the time is (on this repository, format and lint alone are
most of the fast tier), so this is the phase that moves a pre-commit the most.

- `commandCheck` accepts a placeholder for the changed files that match a pathspec it
  declares — `prettier --check {files}` — and a separate form for a full run.
- **No matching changed file → not relevant**, skipped with that reason; never the command
  run with an empty list (many tools read an empty list as "everything" or as an error).
- **Every full-run reason** — `--all`, an unknown range, a shared build input, a wide diff —
  runs the full form. CI therefore still checks everything.
- Deleted files are never passed; each name is quoted for the platform shell; a list the
  shell cannot hold falls back to the full form rather than truncating.
- This repository's own `format` and `lint` checks adopt it; the numbers go in the commit.
- The `script-wrappers` part is unchanged: it wraps `pnpm run <script>`, which takes no
  file list it can trust. Its docblock says so.

Before: `contract-architect` — new options on a published factory, and a new relevance
outcome.

```bash
pnpm --filter specwarden exec vitest run src/runtime/runner/command-check
pnpm gate --id format --id lint
pnpm gate
```

## Phase 8 — parallel by default

- `jobs` defaults to a measured value derived from `availableParallelism()`, capped, and
  the cap and the measurement that chose it are written in the option's docblock.
- A lane waiting for an exclusive check wakes when a slot frees instead of polling on a
  zero timer.
- Every check this repository and the templates write is reviewed for what it touches that
  another could touch at once — a build directory, the ratchet store, a lockfile — and
  declared `exclusive` where it must be. `--fix` and `--tighten` stay single-lane.

Depends on phase 2: parallel lanes with timeouts are how orphans multiply.

Before: `contract-architect` — a published default changes; `adversarial-reviewer` after
it, since a consumer's run changes shape without any edit of theirs.

```bash
pnpm --filter specwarden exec vitest run src/runtime/runner/check-runner
node core/bin/specwarden.mjs check --tier fast --all --cost
pnpm gate
```

## Phase 9 — a per-file primitive reads only what changed (only when measured)

Started only when a consumer's `--cost` shows a per-file primitive — a credential scan, a
forbidden pattern — dominating a pre-commit. Until then this phase stays unstarted.

- A factory declares that a finding in a file depends on that file alone. Only such a
  check may be narrowed; `referencesResolve`, `sourcesAgree` and every cross-file check
  never are.
- Narrowed only on a relevance-filtered run with a known range, no ratchet on the check,
  and neither the check's own file nor the config in the changed set. Any other case reads
  the whole corpus.
- The corpus floor is still judged against the full listing (phase 5 makes that free);
  the pass note says "3 changed of 512".

Before: `contract-architect` and `adversarial-reviewer` — this changes what "clean" means
on a local run.

```bash
pnpm --filter specwarden exec vitest run src/primitives
node core/bin/specwarden.mjs check --cost
pnpm gate
```

---

## Decisions

### Decision: correctness before cost

- Rejected: starting with the cache, the largest speed-up — a cached listing built on the
  quoted output would have made the silent skip faster.

### Decision: `-z`, not a quoting setting

- Rejected: `-c core.quotePath=false` — it still leaves a newline or a tab inside a name
  splitting one file into two, and `-z` makes git's answer exact whatever the name holds.

### Decision: ending a process tree is written in core

- Rejected: a tree-kill package — core depends on nothing, and the two platform paths are
  short enough to own and test.

### Decision: caches live for one run

- Rejected: a listing or contents persisted between runs — a persisted listing can
  disagree with the index, and a one-run lifetime makes invalidation correct by
  construction.

### Decision: no worker threads for engine checks

- Rejected: moving engine checks into `worker_threads` — after phases 5 and 6 their
  measured work is a fraction of a second, and a worker per check costs a module graph
  load each.

### Decision: fsmonitor off only where the repository is disposable

- Rejected: turning fsmonitor off in the engine's `GitVcs` — in a consumer's real
  repository it is their setting and often speeds them up; only a repository a test
  creates and throws away has no use for a daemon.

### Decision: a capped default for `jobs`, not every core

- Rejected: one lane per core — each wrapped tool (vitest, tsc, eslint) already spreads over
  cores itself, so a lane per core oversubscribes the machine it is meant to use.

### Decision: narrowing primitives waits for a measurement

- Rejected: narrowing now — on this repository all reads together cost 250 ms, and the
  change alters what a green local run means; it is worth that only where a consumer
  shows the cost.

## Not in this plan

- The leaked daemons and the hung overnight run already on this machine: a one-off local
  cleanup, not a change to the repository.
- Rewriting any part natively: decided against until `--cost` shows a hot path.

## Harvest

| Fact                                                                         | Goes to                                             |
| ---------------------------------------------------------------------------- | --------------------------------------------------- |
| git is read with `-z`; why a quoted name was a silent skip                   | docblock of `GitVcs`; the fix's changeset           |
| a listed file that cannot be read is named, never dropped                    | `core/GUIDE.md` §5                                  |
| a deadline ends the process tree, and how, per platform                      | docblock of the process adapter; `core/GUIDE.md` §5 |
| test repositories are created by one helper, with fsmonitor off, and why     | `skills/testing/SKILL.md`                           |
| what `--cost` counts, and that it is the evidence for any native rewrite     | `core/GUIDE.md`, the CLI section                    |
| the listing and contents caches live for one run, and why                    | docblocks of `GitVcs` and `NodeFileSource`          |
| a changed-files placeholder is skipped when empty and full on every full run | `core/GUIDE.md` §5; docblock of `commandCheck`      |
| the `jobs` cap and the measurement that chose it                             | the option's docblock                               |
| the before/after numbers of every phase                                      | each phase's commit message                         |
| each consumer-visible phase                                                  | its changeset                                       |
