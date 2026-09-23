# specwarden

**A repository declares its rules; the warden proves which hold.**

> **Status: pre-release.** The engine is written and running; this repository is being
> prepared for its first public release. The npm name is reserved and currently ships
> nothing but documentation. Watch this repository for the first working version.

---

## The problem it exists against

**A check that cannot fail reports success.**

Every quality gate a team adds is a promise: _this class of mistake will not reach main
again_. The promise is kept only while the check can still fail. And checks stop being
able to fail quietly, for reasons that never announce themselves:

- a file glob that matches nothing exits `0`, and a green tier is indistinguishable from
  a tier that linted no files at all;
- a check is registered with a guessed option, finds nothing, and reports green from the
  first day it was written;
- a threshold is raised to make a red run green, and the bar it was defending is gone;
- a gate is added to a CI workflow but not to the local hook, the two lists drift, and
  the one that runs is not the one that was reviewed.

None of those produce a red run. They produce a _green_ one, which is worse, because a
green run is the signal everyone acts on. SpecWarden is built so that each of them is an
error the harness itself raises, rather than something a person notices in six months.

## What it is

A quality-gate engine, plus packages beside it that each know one thing.

```
core/        the engine — ports, primitives, the runner, the CLI, and only the checks
             that verify the harness ITSELF: zones, ratchets, the rule registry
modules/     optional opinions a repository chooses
  docs/        documentation: paths, symbols, counts, placement, hygiene
  plans/       plans and decision logs
  ops/         env files, upstreams, CI coverage, build order, shell scoping
  security/    credential scanning
  agents/      coding-agent role definitions
  openspec/    reads an OpenSpec tree
  speckit/     reads a Spec Kit tree
plugins/     one stack's conventions, declared against the engine's primitives
templates/   a tuned starting tree, so day one is one command rather than a blank file
```

**What decides where a check goes:** if it could be _wrong_ about a repository that has
never heard of it, it is an opinion and it ships as a module. A documentation layout, a
plan lifecycle, a compose file, a vendor's credential format — every one of those is a
house's decision, and a house that disagrees should not inherit it. Zones, ratchets and
the rule registry are the engine's own mechanics, and nothing else can own them.

That line is not theoretical. The engine once held nineteen checks, and every consumer
inherited all nineteen — including five vendor credential formats it might not use, an
English hedging vocabulary and a TypeScript declaration grammar. None of it was wrong;
all of it was someone else's opinion arriving unasked. That is why `modules/` exists.

### Every package

<!-- PACKAGES:START -->

| Package | Kind | What it is |
| --- | --- | --- |
| ◆ `specwarden` | core | A repository declares its rules; the warden proves which hold. |
| ▸ `@specwarden/docs` | module | Documentation checks: paths, symbols, counts, placement, hygiene. |
| ▸ `@specwarden/plans` | module | Plans and decision logs — one way of working, not the only one. |
| ▸ `@specwarden/ops` | module | Env files, proxy upstreams, CI coverage, build order, shell scoping. |
| ▸ `@specwarden/security` | module | Credential scanning, with a vendor library as a preset rather than a mandate. |
| ▸ `@specwarden/agents` | module | Coding-agent role definitions. |
| ▸ `@specwarden/openspec` | module | Reads an OpenSpec tree as the source of requirements. |
| ▸ `@specwarden/speckit` | module | Reads a Spec Kit tree as the source of requirements. |
| ⬡ `@specwarden/plugin-nestjs` | plugin | NestJS conventions, declared against the engine's primitives. |
| ⚙ `@specwarden/scaffold-parts` | scaffold | The pieces every template is assembled from. |
| ⚒ `@specwarden/template-node-ts` | template | An ordinary TypeScript repository. |
| ⚒ `@specwarden/template-docs-only` | template | A repository whose product IS documentation. |
| ⚒ `@specwarden/template-monorepo` | template | A pnpm workspace — lockfile, build order, dependency pins, CI coverage. |
| ⚒ `@specwarden/template-nestjs` | template | A NestJS backend — the plugin wired, plus what a backend needs. |
| ⚒ `@specwarden/template-agentic` | template | A repository coding agents work in — roles, docs, plans, a perimeter. |
| ⚒ `@specwarden/template-ops` | template | Infrastructure — env files, proxy upstreams, shell scoping, runbooks. |
| ⚒ `@specwarden/template-openspec` | template | A repository specified with OpenSpec — the spec seam wired. |
| ⚒ `@specwarden/template-speckit` | template | A repository specified with Spec Kit — the spec seam wired. |

<!-- PACKAGES:END -->

## How it works

**One list.** Gates live in a single registry the repository owns. The hook, each CI job
and the nightly run all invoke the same engine against the same list. There is no second
place to add a gate, because two lists drift and the drift is invisible until something
ships through the gap.

**Checks are ordinary files.** A check is a module that exports a function. The engine
discovers it, injects what it asked for, and reads its verdict. Nothing about it is
framework-shaped: there is no check runtime to learn and no indirection to unpick later.

**A check reads the world only through ports** — `files`, `vcs`, `proc`, `clock`,
`writer` — gated by the capabilities it declares. A check with no `write` capability has
no writer at all. This is what makes a check testable against an in-memory tree, and
unable to reach anything it did not ask for.

**Every check names the rule it enforces.** A check that names none is itself a failure:
an unattributed check is one nobody can argue with, relax deliberately, or retire.

**Relevance, with a reason.** A check runs when the changed-file set matches its
predicate, when a shared build input changed, when the diff is wider than the configured
trigger, or when the range is unknown — the last being the fail-safe. Every route to a
full run returns a _reason_, and the CLI prints it: a full run that cannot say why it is
one is indistinguishable from a tier nobody ever filtered.

**Ratchets for debt you cannot pay today.** A check that cannot reach its target now is
armed anyway, by recording the current measurement and failing on a move in the wrong
direction. The number is walked toward the target as the debt is paid and can never move
back, so a green check can never get greener by moving its own bar. The one-way
invariant is enforced by the store, not by trust.

**Zones.** The engine is repository-agnostic and is checked to be: it names no host
literal and never imports the consumer's side. Everything that knows _your_ repository
lives in your config directory and nowhere else. The boundary is enforced on every run,
which is what makes the engine safe to upgrade.

**A stale build is an error, not a surprise.** The CLI compares a fingerprint of the
sources against the stamp the build wrote, and refuses to run compiled output that no
longer matches — because a harness reporting on yesterday's code is the same failure as a
check that cannot fail.

## Templates

```
specwarden init --template <name>
```

A template emits **files** — the same ordinary check modules the engine discovers, which
your repository then owns and edits. Nothing it writes is special. Delete the template
package the day after and lose nothing.

What a template supplies is the **decisions**: which checks are worth having on day one,
which options keep them from being noisy, and which to leave out. A check it cannot
configure _truthfully_ ships as `.example`, with what to fill in and what happens if it is
left half-done — because a check registered with a guessed option is exactly the silent
green this tool exists against. `init` lists those files separately, so they are a
decision rather than something somebody finds much later.

A template writes a part only where its subject exists: no compose file, no env-file
check; no workflow, no CI-coverage check; no tracked shell, no shell check. Each of
those, written blind, is a red first run for a reason that has nothing to do with your
code — and the first run is what decides whether a tool is kept.

## Usage

```
specwarden adopt                  # what this repository already is — reads, writes nothing
specwarden suggest                # rules it already follows, each armed at today's count
specwarden init [--template <n>]  # write the starting tree
specwarden new <id>               # a check and its test, red until the body is written

specwarden check                  # what the changed files make relevant
specwarden check --all            # the whole roster, regardless of the diff
specwarden check --tier fast      # one tier
specwarden check --id <id>        # one check
specwarden check --base <ref>     # measure the change from <ref> — a pull-request run
specwarden check --list           # what would run, in order, and why
specwarden check --fix            # repair what is derivable, then re-run
specwarden check --tighten        # record a passing run's measurement as the new bar
specwarden doctor [--json]        # the roster, capabilities, ownership, rule coverage

specwarden plan status <file> [--verify]  # a plan's phases; --verify runs each acceptance
specwarden plan archive <file>            # refuses until the harvest is declared
specwarden sync-invariants                # requirements against deposited invariants
specwarden migrate                        # the config, moved to this engine's version
specwarden perimeter                      # one assistant action on stdin — the hook entry
```

Exit `0` every gate held, `1` a gate failed, `2` the line, the config or a check file
could not be used. `specwarden --help` lists every flag and environment variable.

`spw` is a shorter alias for the same binary. Requires Node 24 or newer.

## What to do now

Nothing is installable yet. If this is the kind of thing you want:

- **Watch this repository** — the first release lands here.
- **Open an issue** if you have a gate that went quietly green on you. Those reports are
  what the check roster is built from, and the failure modes listed at the top of this
  file all came from real ones.

## License

MIT
