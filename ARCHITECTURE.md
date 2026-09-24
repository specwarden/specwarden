# specwarden

specwarden as a small monorepo: a quality-gate ENGINE that knows nothing about any
repository, and packages beside it that know one thing each.

```
specwarden/
  core/            the engine — ports, primitives, the runner, the CLI, and only the
                   self-checks, which audit the declarations (zones, ratchets, the rules)
  modules/         optional functionality a repository chooses
    docs/          documentation: paths, symbols, counts, placement, hygiene
    plans/         plans and decision logs — one way of working, not the only one
    ops/           env files, upstreams, CI coverage, build order, shell scoping
    security/      the credential scan and its vendor library
    agents/        coding-agent role definitions
    openspec/      reads an OpenSpec tree
    speckit/       reads a Spec Kit tree
  plugins/
    nestjs/        one stack's conventions, declared against the engine's primitives
  templates/       a tuned starting TREE, so day one is one command rather than a blank file
    _parts/        the pieces a template is assembled from — one check, its rule, its config
    node-ts/       an ordinary TypeScript repository
    docs-only/     a repository whose product IS documentation
    monorepo/      a pnpm workspace — lockfile, build order, dependency pins, CI coverage
    nestjs/        a NestJS backend — the plugin wired, plus what a backend needs
    agentic/       a repository coding agents work in — roles, docs, plans, a perimeter
    ops/           infrastructure — env files, proxy upstreams, shell scoping, runbooks
    openspec/      a repository specified with OpenSpec — the spec seam wired
    speckit/       a repository specified with Spec Kit — the spec seam wired
  _playgrounds/    the ONE root playground: every package composed, through the CLI
```

A TEMPLATE emits FILES — the same ordinary `checks/<family>/<id>.check.mjs` the engine
discovers, which the repository then owns and edits. Nothing it writes is special: no
template runtime, no indirection to unpick later; delete the package the day after
`specwarden init --template <name>` and lose nothing.

What it supplies is the DECISIONS: which checks are worth having on day one, which
options keep them from being noisy, and which to leave out. A check it cannot configure
TRUTHFULLY ships as `.example` with what to fill in and what happens if it is left
half-done — because a check registered with a guessed option finds nothing and reports
green, which is the failure this engine exists against. `init` lists those files
separately so they are a decision rather than something somebody finds in six months.

A template is a list of DECISIONS, not four hundred lines of generated prose. The pieces
themselves live once, in `templates/_parts/`: a part is the check or checks it writes — the
files that configure them, the rules those files enforce, and where one is needed the config field that
makes the two resolve. A template composes parts and phrases what is different about
them here, because "why this check earns its place" is genuinely not the same sentence in
a handbook and in a repository agents work in. `_parts` is a build-time dependency of the
templates and of nothing else: what `init` writes imports the MODULES directly, so a tree
survives deleting every template package the day after.

A part is written only where its subject EXISTS: no compose file, no env-file check; no
workflow, no CI-coverage check; no tracked shell, no shell check; no `lint` script, no
lint wrapper. Each of those, written blind, is a red first run for a reason that has
nothing to do with the repository's code — and the first run is what decides whether the
tool is kept. Detection asks the question the way the CHECK will ask it, which is why
"is there shell here" reads tracked files rather than the filesystem.

Every template's own tests write its files and IMPORT them, examples included. A template
emits strings and a typechecker never reads them, so a module option renamed elsewhere
leaves the template compiling happily and producing a tree that throws on the first run.
That test found three such breaks the day it was written, and three more when the parts
landed — including two `.example` files that would have failed on the day somebody
renamed them, which is the worst possible day.

Every template produces a tree that is GREEN on `check --all` with nothing edited in between —
over a repository of the kind it is for, which each template carries in its own
`_playground/repository/`. The same proof plants one defect per check it wrote and requires
exactly that check to go red; `_playgrounds/README.md` lists what that found on day one.

**What decides where a check goes:** if it could be WRONG about a repository that has
never heard of it, it is an opinion and it ships as a module. A documentation layout, a
plan lifecycle, a compose file, a vendor's credential format — every one of those is a
repository's own decision. Zones, ratchets and the rule register are the engine's own mechanics,
and nothing else can own them.

That test is why `modules/` exists at all. The engine used to hold nineteen checks, and
every consumer inherited all nineteen — including five vendor credential formats it may
not use, an English hedging vocabulary, and a TypeScript declaration grammar. None of
that was wrong; all of it was someone else's opinion arriving unasked.

Everything that knows THIS repository lives outside this folder, in `.specwarden/` at the
root: the check list, the check bodies configured with local facts, the declared rules, the
perimeter and the ratchets. `.specwarden/README.md` states that boundary from the other side.

## Why it is shaped this way

The split is not tidiness — it is the difference between a rule and a repository. "Every
heavy check has a CI job" is true of any project with a check list and a CI; "the workflow
is `ci.yml` and the required job is `ci-ok`" is true of exactly one. Keeping the first in `core/`
and the second in a consumer's config is what makes the first REUSABLE, and it is enforced
rather than trusted: the `zone-boundary` check fails a product source that names a consumer
literal — a workspace path, an ORM, a domain noun — anywhere, comments included.

A plugin sits between the two. NestJS conventions are not this project's and not the
engine's: any codebase drawing the line "a module reaches the database through a repository"
wants the same check, and only the module root and the ORM name differ. So a plugin
DECLARES checks built from the engine's primitives, takes what varies as options, and never
supplies a port adapter — the loader refuses one, because a plugin that could reach the
filesystem itself would be a way around the capabilities that make installing someone
else's check safe at all.

A debt ratchet is likewise the consumer's: the plugin takes an id, the consumer owns the file
behind it. A plugin shipping a NUMBER would be asserting something about a tree it has
never seen.

## How a file is placed

Three rules, followed in every package here and checked where a machine can check them.

**1. A unit gets a folder.** Not a file beside twenty siblings. The folder is
kebab-case and named for the unit; the file inside repeats that name and adds the role:

```text
checks/doc-counts/doc-counts.check.ts
checks/doc-counts/doc-counts.check.spec.ts
domain/ports/file-source/file-source.port.ts
infrastructure/node-file-source/node-file-source.adapter.ts
runtime/cli/adopt/adopt.command.ts
runtime/cli/adopt/detect-repo/detect-repo.util.ts
```

The spec sits beside its subject, and a spec past ~300 lines splits by concern —
`<unit>.<role>.<concern>.spec.ts` — over a shared `.spec-helpers.ts`.

**2. A category holding ONE unit is that unit.** A folder named for a category that
wraps a single file says nothing the unit's own folder does not, so those wrappers are
gone. The corollary
matters more: something only one command needs lives INSIDE that command
(`cli/adopt/detect-repo/`), so a helper's blast radius is visible in the tree instead
of discovered by grep.

**3. The suffix names the role**, and the list is closed. Adding a suffix means the
role is new — say so in a review rather than inventing one quietly.

| Suffix          | What it is                                                           |
| --------------- | -------------------------------------------------------------------- |
| `.check.ts`     | a check factory: options in, `ICheck` out                            |
| `.primitive.ts` | a declarative primitive — a structural rule without a class          |
| `.model.ts`     | types and the pure rules over them; imports nothing but other models |
| `.port.ts`      | an interface the engine depends on and an adapter implements         |
| `.adapter.ts`   | a class implementing a port against something real                   |
| `.service.ts`   | a class with behaviour of its own                                    |
| `.util.ts`      | pure functions, no state                                             |
| `.factory.ts`   | returns a configured thing                                           |
| `.command.ts`   | one CLI entry point                                                  |
| `.constant.ts`  | closed vocabularies                                                  |
| `.error.ts`     | a typed failure                                                      |
| `.plugin.ts`    | a plugin's declaration                                               |
| `.source.ts`    | an `ISpecSource` — where requirements and tasks come from            |
| `.template.ts`  | a tuned starting set, composing parts                                |
| `.part.ts`      | one check a template can emit: its file, its rule, its config field  |

An underscored folder is not a peer of what sits beside it: `_shared/` is what the
siblings are built from, `_contract/` is a suite belonging to a PORT rather than to any
one adapter.

**Why this and not something looser.** The engine spent its first months as flat files
— nineteen checks beside nineteen specs, a CLI module sitting next to a folder of the
same name, one name used for two different things at two levels, and a domain module
whose name collided with an unrelated top-level folder. Nothing there was wrong line by
line; it was unreadable in aggregate, because a name told you nothing about what a file
was until you opened it. Those four are gone, and the rules above are what closed them.

## Where to read next

| You want                                               | Read                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| how the engine works, and how to add a check or a rule | `core/GUIDE.md`                                                           |
| what a plugin may declare                              | `plugins/nestjs/src/nestjs/nestjs.plugin.ts` — the header is the contract |
| where a repository's own facts go                      | `.specwarden/README.md`                                                   |

## Speed

A tier's wall clock is mostly spent OUTSIDE this process — test suites, compilers,
shell scripts — while the engine's own checks measure in fractions of a second. So the
lever is overlap, not micro-optimisation:

```
specwarden check --tier fast --all            90s
specwarden check --tier fast --all --jobs 4   53s
specwarden check --tier fast --all --jobs 6   52s
```

Measured on this repository, 51 checks, two samples each. Past four lanes the curve is
flat: what remains is one 46-second check, and nothing overlaps a critical path.

Three properties are preserved, and each is pinned by a test:

- **The report is identical**, order included. A run whose output order shifted between
  runs could not be diffed against another, which is the cheapest debugging tool this
  output has. Results are flushed in roster order as their prefix completes, so work
  still starts as early as a lane allows and only the SPEAKING is ordered.
- **A writing run stays serial.** `--fix` and `--tighten` ignore concurrency: a
  concurrent writer is a corruption nobody would trace back to a flag.
- **Isolation is declared, not assumed.** A check that cannot share the machine sets
  `exclusive`. This is not hypothetical — at six lanes a suite spawning a process per
  file failed two runs out of three, with no message naming a cause, and a check that
  fails only sometimes teaches a team to re-run rather than to read.

The default is 1. Concurrency is opt-in because the promise it makes on a check's
behalf — that the check is isolated — is not the engine's to make.

## Build and test

Each package builds and tests on its own (`pnpm --dir core run build`,
`pnpm --dir plugins/nestjs test`). Every package is covered by this repository's `lint`,
`typecheck` and `unit` checks, which reach each one through `pnpm -r` and refuse a
selection that matched no package — a package no check reaches is a package nobody
checks, and this repository has paid for that shape before.
