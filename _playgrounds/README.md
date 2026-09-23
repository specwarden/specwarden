# \_playgrounds

> **THIS IS NOT A REFERENCE CONFIGURATION.** It installs every package this repository
> publishes and wires all of them at once, because the point is to find where they disagree.
> A real repository installs the engine and the two or three modules whose opinions it
> actually holds. Copy the shape of a check file from here, never the list.

There is exactly **one** playground at the root, and it is this one. Every other playground
lives inside the package it proves:

```
_playgrounds/                 EVERY package, composed — the only one at the root
├── playground.spec.ts        in-process: one config, the registry and the runner
├── cli.spec.ts               the same config as FILES, discovered and run by the CLI
├── consumer/                 that config — a consumer's `.specwarden/`, as they write it
└── repository.ts             the clean and broken trees both specs run over

<package>/_playground/        ONE package, as a consumer wires it
templates/<name>/_playground/ ONE template, over a repository of its kind
├── playground.spec.ts        green on the first run, and every check red once
└── repository/               the stranger's repository `init` is run in
    └── .specwarden/          what `init --template <name>` writes there — GENERATED
```

## Why three kinds, and what each can see that the others cannot

| Where                           | It proves                                                                 | A failure only it can see                                                    |
| ------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `<package>/_playground/`        | the package works imported **by name**, through its own `exports`         | a factory renamed and never re-exported from the barrel                      |
| `templates/<name>/_playground/` | `init` writes a tree that is green over a real repository of its kind     | a generated check that throws, or is red on day one, or can never go red     |
| `_playgrounds/` (this)          | every package works **together**, under one config, through the real CLI  | two packages minting one id; a plugin's checks never reaching the registry   |

They are not tiers of one thing. A package playground passing says nothing about what a
template writes into a stranger's repository, and a green template says nothing about two
packages colliding under one config.

## The template playgrounds found three defects the day they were written

The eight trees they replaced were `init` run over a README and a package.json — green,
because there was nothing in them to check. Over repositories of the right kind:

- **the nestjs template was red on every TypeORM service** — an entity has to import
  `typeorm`, and the generated check allowed it only under `repositories/`;
- **`plan-shape` crashed on the agentic template's first plan** — it read a heading's depth
  from a capture group the template's own regex does not have;
- **`doc-paths` never read a root `README.md`** — `**/*.md` went to git as a plain
  pathspec, where `**/` requires a slash. The test kit read it as a glob, so every unit test
  passed.

And the monorepo tree's `lockfile` check had been verifying **this** repository's lockfile:
with no workspace of its own, `pnpm install` walked upwards until it found one.

## What every template playground asserts

`scripts/playground-proof.mjs` owns it, once:

1. green under `check --all` with nothing edited after `init`, no check skipped;
2. a defect listed for **every** check the template wrote, and for no check it did not —
   so a new part cannot land without a scene showing it fail;
3. each defect, planted **alone** in a scratch copy, turns exactly its own check red and
   nothing else, with a finding naming what was planted.

Every run is the real CLI over a scratch git repository. A check reads tracked files, so a
run in place would answer differently before and after somebody's `git add`.

## Changing one

- **A template's output** — change the template, then
  `node scripts/playgrounds.mjs --write <name>` and review the `.specwarden/` diff. The
  `playgrounds` gate fails on a hand edit there.
- **A template's repository** — edit it by hand; it is a fixture, and its README says what
  it pretends to be. Then regenerate, because `init` detects what it writes for.
- **This one** — `consumer/` and `repository.ts` together. Both specs assert the same two
  lists in `repository.ts`, so they cannot drift into describing different configs.

`skills/playgrounds/SKILL.md` owns the rules.

## Running them

```bash
pnpm --filter @specwarden-playgrounds/workspace test   # this one
pnpm --filter @specwarden/template-agentic test        # one template, unit suite and playground
node scripts/playgrounds.mjs                            # every template's .specwarden/ is current
```

`pnpm build` first: the CLI refuses a `dist` older than its sources, by design.
