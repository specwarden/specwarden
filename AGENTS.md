# specwarden — the repository router

The entry point for anyone working here, human or agent. It **routes**; it does not
restate. Every rule below has one owner, and the owner is a `SKILL.md`.

`CLAUDE.md` is generated from this file — `pnpm check:router:write` — so the two cannot
drift. Edit this one.

## What this repository is

A quality-gate engine published as npm packages: `specwarden` (the engine, unscoped — the
one claim this product makes on a global name) and everything else under `@specwarden/`:
the optional modules, a plugin, the templates and the scaffold parts they are assembled
from. `scripts/registry.mjs` is the list; the root `README.md` table is generated from it.

It is consumed by other repositories, so almost everything here is a **promise**: a name in
a barrel is kept until a major version, and a check's verdict is something somebody's CI
depends on.

```
core/                 the engine — ports, primitives, the runner, the CLI, and only the
                      checks that verify the harness ITSELF: zones, ratchets, the rules
modules/<name>/       opinions a repository chooses, installed one at a time
plugins/<name>/       one stack's conventions, declared against the engine's primitives
templates/<name>/     a starting tree; `_parts/` is what templates are assembled from
<pkg>/_playground/    the package proved the way a consumer uses it — every package has one
_playgrounds/         the ONE root playground: every package composed, through the CLI
skills/               the canon: one folder per rule, each a SKILL.md
scripts/              the logic the gates wrap, each with its spec, plus the package registry
.specwarden/          this repository checked by the engine it publishes
.changeset/           pending changesets — how a version is cut
.claude/agents/       the roster: one file per role
.claude/commands/     the flows: /gate /phase /surface /playground /canon /review /commit
                      /scaffold /release
```

## The one rule everything rests on

**If a check could be WRONG about a repository that has never heard of it, it is an
opinion and it ships as a module.** A documentation layout, a plan lifecycle, a compose
file, a vendor's credential format — each is a house's decision, and a house that
disagrees should not inherit it. Zones, ratchets and the rule register are the engine's
own mechanics, and nothing else can own them.

The engine therefore **depends on nothing**. Everything depends on `core`; `core` imports
no module, plugin or template. A lint rule says so — and `scripts/eslint-config.test.mjs`
proves the rule can fail, because for as long as its pattern named the packages' old
prefix it could not.

## Start here, by task

| Doing this                               | Read first                                                   |
| ---------------------------------------- | ------------------------------------------------------------ |
| adding or moving a file                  | `skills/structure/SKILL.md`                                  |
| adding a package                         | `skills/structure/SKILL.md` §5, then `scripts/registry.mjs`  |
| writing a check, in a module or a gate   | `skills/checks/SKILL.md`                                     |
| adding a gate to this repository         | `skills/gates/SKILL.md`                                      |
| writing a test                           | `skills/testing/SKILL.md`                                    |
| changing what a template writes          | `skills/playgrounds/SKILL.md`                                |
| exporting a name, or changing a verdict  | `skills/publishing/SKILL.md` §2, then `.changeset/README.md` |
| writing a comment, a README, a guide     | `skills/documentation/SKILL.md`                              |
| writing or editing a shipped skill       | `skills/skills/SKILL.md`                                     |
| starting multi-phase work                | `skills/plans/SKILL.md`                                      |
| releasing                                | `skills/publishing/SKILL.md`, then `CONTRIBUTING.md`         |
| TypeScript settings and what they forbid | `skills/typescript/SKILL.md`                                 |
| writing the commit                       | `skills/commits/SKILL.md`                                    |
| changing one package's own code          | that package's `SKILL.md` — its invariants, and what to run  |
| changing what a CONSUMER's agent is told | `<pkg>/skills/<name>/SKILL.md`, and `scripts/skills.mjs`     |
| changing a playground                    | `_playgrounds/README.md`                                     |

Three documents sit in every package and answer three different questions: `README.md` is
"what is this" (generated), `GUIDE.md` is "how do I use it", `SKILL.md` is "what may I not
change in it". A rule true of ONE package lives in that package's `SKILL.md`; a rule true of
all of them is a skill above, and is never copied down.

## The flow

Every change goes the same way, and `/phase` runs it end to end:

1. **Read the canon that owns the area.** Not the code first — the code says what is, the
   canon says what may be.
2. **Change one thing.** A check changes with its test; a template with its playground.
3. **Show it red.** A new or changed check is watched failing on the defect it exists for
   before it is believed. A check nobody has seen fail is a hope.
4. **`pnpm gate`.** It is the whole list, both tiers, and CI runs the same engine over the
   same files — a local green and a remote green mean the same. `pnpm gate:fast` while
   working.
5. **A changeset**, when a consumer would notice: `pnpm changeset`.
6. **Commit.** One change, one commit, with the reason and the numbers.

## Rules that hold everywhere

1. **A check that cannot fail reports success.** Every gate carries the declaration that
   makes its own silence impossible — `corpus`, `paths`, `expect`/`refuse` — and every check
   has been seen red. `skills/checks/SKILL.md` §3.
2. **The canon owns the rule; the gate owns the enforcement.** If they disagree, one of them
   is a bug — say which, do not pick silently.
3. **A ratchet only tightens.** Coverage thresholds (in the registry), the mutation `break`,
   every count ratchet. Moving one to make a run pass is the edit that ends the ratchet;
   add the test instead.
4. **A real adapter and its fake agree.** `core/src/infrastructure/_contract/` runs the same
   cases against both. A fake that answers differently makes every test written against it
   measure a fiction — the VCS fake read pathspecs as globs while git did not, and no
   documentation check read a root `README.md`.
5. **Generated files are edited through their generator** — see below.
6. **Nothing the engine prints names a file the consumer does not have.** A finding is read
   in somebody else's repository.

## What is generated

Nothing below is edited by hand. `pnpm check:drift` fails when a copy disagrees with its
source:

- every package's `package.json`, `tsconfig.json`, `vitest.config.ts` (with its coverage
  ratchet), `tsup.config.ts`, `README.md` and `LICENSE` — from `scripts/registry.mjs`
- the package table in the root `README.md`, and `llms.txt`
- every `<pkg>/.claude-plugin/plugin.json`, every `skills/**/reference.md`, and the
  marketplace that lists them
- `CLAUDE.md` — from this file
- every `templates/<name>/_playground/repository/.specwarden/` — from its template, by
  `node scripts/playgrounds.mjs --write <name>`; the `playgrounds` gate compares them

Change the source, regenerate. A direct edit does not survive the next run — which is the
point, and why the window between the edit and the next run is closed by a gate rather
than by memory.

## Running it

```bash
pnpm gate              # this repository, checked by the engine it publishes — both tiers
pnpm gate:fast         # the tier a commit runs: everything that only reads files
pnpm doctor            # what is declared, without running any of it
pnpm scaffold          # regenerate everything derived from the registry
pnpm build             # the CLI refuses a dist older than its sources
```

`pnpm gate` **is** the check list. There is no second place to add one: a file under
`.specwarden/checks/` is a gate, and a file there that exports no check is a load error
rather than a silent skip. `pnpm check` and `pnpm release` run the same list.

## When to spawn an agent

Below the line, work directly: a single-file change, a rename, a doc fix, reading code to
answer a question.

Above it — three or more packages, a new published name, a verdict that changes, a
template's output that changes, a release — the roster is the division of labour:

| Role                   | Model  | Spawn it                                                                |
| ---------------------- | ------ | ----------------------------------------------------------------------- |
| `scout`                | haiku  | first, ONCE, with every question batched — where things are             |
| `lead`                 | opus   | work above the threshold: it returns the plan, the main session runs it |
| `planner`              | opus   | multi-phase work whose decisions are made: `_plans/NN-<slug>.md`        |
| `contract-architect`   | opus   | BEFORE a published name, option, default or verdict changes             |
| `gate-author`          | sonnet | a check — in a module, or a gate here — and how it could go silent      |
| `template-author`      | sonnet | what a template writes, and its playground                              |
| `test-writer`          | sonnet | the invariants a change introduced, and a package below its ratchet     |
| `test-runner`          | sonnet | running the list and reading a red gate, without fixing it              |
| `qa`                   | sonnet | finished work, green, before the commit                                 |
| `adversarial-reviewer` | opus   | AFTER the first review, on anything that cannot be taken back           |
| `canon-keeper`         | sonnet | which skill owns a question (before); where a learned rule goes (after) |
| `release-manager`      | sonnet | changesets against the diff, versions, tarballs, publish                |

The files are `.claude/agents/<role>.md`; `pnpm gate --id agents` holds each to its shape,
and none of them may spawn another. Two economics decide how many to use:

- **Batch to find out, isolate to be sure.** Questions are cheap inside one agent and
  expensive across many, so gather context in ONE `scout` call. Verification is the
  opposite: `contract-architect`, `adversarial-reviewer` and `qa` run in fresh contexts,
  because a reviewer sharing a context with the writer has stopped being a review.
- **A gate is cheaper and stricter than an agent reading for the same thing.** If
  `pnpm gate --id <x>` decides it, run the gate. Agents exist for what no gate can read:
  whether a promise should be made, whether a verdict change is a fix or a break, whether the
  reason in a comment is true.

## Conflict order

1. What the user asked for.
2. The skill that owns the rule.
3. This router.
4. Generic best practice.

When 2 and 3 disagree, the skill wins and this file is wrong — fix it here.
