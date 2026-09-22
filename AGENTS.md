# specwarden — the repository router

The entry point for anyone working here, human or agent. It **routes**; it does not
restate. Every rule below has one owner, and the owner is a `SKILL.md`.

`CLAUDE.md` is generated from this file — `pnpm check:router:write` — so the two cannot
drift. Edit this one.

## What this repository is

A quality-gate engine published as eighteen npm packages: `specwarden` (the engine),
seven `specwarden-module-*`, one `specwarden-plugin-*`, eight `specwarden-template-*` and
the scaffold parts they are assembled from.

It is consumed by other repositories, so almost everything here is a **promise**: a name
in the engine's barrel is kept until a major version, and a check's verdict is something
somebody's CI depends on.

```
core/              the engine — ports, primitives, the runner, the CLI, and only the
                   checks that verify the harness ITSELF: zones, ratchets, the rules
modules/<name>/    opinions a repository chooses, installed one at a time
plugins/<name>/    one stack's conventions, declared against the engine's primitives
templates/<name>/  a starting tree; `_parts/` is what they are assembled from
_playgrounds/      one scaffolded repository per template, committed and green
skills/            the canon: one folder per rule, each a SKILL.md
scripts/           the executable half of the canon, plus the package registry
.specwarden/       this repository checked by the engine it publishes
.claude/agents/    the roster: one file per role
.claude/commands/  the flows
```

## The one rule everything rests on

**If a check could be WRONG about a repository that has never heard of it, it is an
opinion and it ships as a module.** A documentation layout, a plan lifecycle, a compose
file, a vendor's credential format — each is a house's decision, and a house that
disagrees should not inherit it. Zones, ratchets and the rule register are the engine's
own mechanics, and nothing else can own them.

The engine therefore **depends on nothing**. Everything depends on `core`; `core` imports
no module, plugin or template. A lint rule says so, because the day it stops being true
nothing else would notice.

## Start here, by task

| Doing this                               | Read first                                               |
| ---------------------------------------- | -------------------------------------------------------- |
| adding or moving a file                  | `skills/structure/SKILL.md`                              |
| adding a package                         | `skills/structure/SKILL.md`, then `scripts/registry.mjs` |
| writing a check                          | `skills/checks/SKILL.md`                                 |
| writing a test                           | `skills/testing/SKILL.md`                                |
| writing a comment, a README, a guide     | `skills/documentation/SKILL.md`                          |
| writing or editing a shipped skill       | `skills/skills/SKILL.md`                                 |
| changing what a template emits           | `skills/playgrounds/SKILL.md`                            |
| adding a gate to this repository         | `skills/gates/SKILL.md`                                  |
| releasing                                | `skills/publishing/SKILL.md`, then `CONTRIBUTING.md`     |
| TypeScript settings and what they forbid | `skills/typescript/SKILL.md`                             |

## What is generated

Nothing below is edited by hand. Each is derived from `scripts/registry.mjs`, and
`pnpm check:drift` fails when a copy disagrees with its source:

- every package's `package.json`, `tsconfig.json`, `tsup.config.ts`, `README.md`, `LICENSE`
- the package table in the root `README.md`
- every `.claude-plugin/plugin.json` and the marketplace that lists them
- `CLAUDE.md`
- every tree under `_playgrounds/`

Change the registry, run `pnpm scaffold`. A direct edit does not survive the next run —
which is the point, and why the window between the edit and the next run is closed by a
gate rather than by memory.

## Running it

```bash
pnpm gate              # this repository, checked by the engine it publishes
pnpm gate:fast         # the tier a commit runs: everything that only reads files
pnpm doctor            # what is declared, without running any of it
pnpm scaffold          # regenerate everything derived from the registry
```

`pnpm gate` **is** the check list. There is no second place to add one: a file under
`.specwarden/checks/` is a gate, and a file there that exports no check is a load error
rather than a silent skip.

## The failure this repository exists against

**A check that cannot fail reports success.** Every gate here carries the declaration
that makes its own silence impossible: `corpus` for how much it must have examined,
`paths` for the files a command is pointed at, `expect` and `refuse` for output that a
zero exit would not prove anything about.

A gate added without one of those, where one applies, is the defect this product is
named after — arriving in the product itself.
