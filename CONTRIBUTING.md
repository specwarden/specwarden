# Contributing

## Running the repository

```bash
pnpm install          # builds every package on install, through `prepare`
pnpm gate             # this repository, checked by the engine it publishes
pnpm gate:fast        # the tier a commit runs: everything that only reads files
pnpm doctor           # what is declared, without running any of it
```

`pnpm gate` **is** the check list. There is no second place to add a gate: a file under
`.specwarden/checks/` is one the moment it exists, and a file there that exports no check
is a load error rather than a silent skip.

Node 24 and pnpm 10 — both pinned in the root manifest, and the lockfile is what CI
installs with.

## The shape of the repository

| Where               | What                                                        |
| ------------------- | ----------------------------------------------------------- |
| `core/`             | the engine. Depends on nothing                              |
| `modules/<name>/`   | opinions a repository chooses                               |
| `plugins/<name>/`   | one stack's conventions                                     |
| `templates/<name>/` | starting trees; `_parts/` is what they are assembled from   |
| `_playgrounds/`     | one scaffolded repository per template, committed and green |
| `skills/`           | the canon — one folder per rule                             |
| `scripts/`          | the executable half of the canon, plus the package registry |
| `.specwarden/`      | this repository, checked by the engine                      |

`AGENTS.md` routes to the rule that owns each decision. Read it before the first change.

## What is generated

Nothing below is edited by hand:

- every package's `package.json`, `tsconfig.json`, `tsup.config.ts`, `README.md`, `LICENSE`
- the package table in the root `README.md`
- every `.claude-plugin/plugin.json` and the marketplace listing them
- `CLAUDE.md`
- every tree under `_playgrounds/`

Change `scripts/registry.mjs` (or the template, for a playground) and run `pnpm scaffold`.
A direct edit does not survive the next run — which is why the window between the edit and
that run is closed by a gate rather than by memory.

## Adding a package

1. an entry in `scripts/registry.mjs` — kind, description, summary, deps;
2. `pnpm scaffold`;
3. `src/index.ts` and the code;
4. a changeset, if it is user-visible.

The kind decides the npm name, the directory and the dependency on the engine. The
naming scheme is `specwarden` for the engine — unscoped, because one product makes
exactly one claim on a global name — and `@specwarden/*` for everything else.

## Adding a check to this repository

1. the logic in `scripts/`, with a test beside it;
2. a file under `.specwarden/checks/<family>/<id>.check.mjs`;
3. the rule it enforces, declared on the check;
4. **show it red before believing it.**

`skills/gates/SKILL.md` owns the rest.

## Tests

```bash
pnpm test             # every package, one at a time
pnpm test:scripts     # the repository's own guard scripts
pnpm test:coverage
```

Sequential is enforced rather than described: each vitest already fans out across every
core, and two heavy suites at once dies with a terminated worker rather than an assertion
— in a different package each time, which teaches re-running instead of reading.

The engine additionally runs mutation testing (`pnpm --dir core test:mutation`): a unit
test proves a check passes on good input, a mutant proves its test would _notice_ the
check breaking.

## Cutting a release

```bash
pnpm changeset          # describe the change and pick the bump
pnpm version:packages   # changesets writes versions and changelogs
pnpm release            # check, verify the built tarballs, publish
```

`pnpm release` runs the whole check list first, on purpose: a manual release cannot skip
what CI runs for it. The undo window on npm is 72 hours and exists once per version.

## Commit messages

The diff says what changed; the log says why, and what it cost. `skills/commits/SKILL.md`
owns the shape — briefly: the defect that produced the rule, with its measurement; the
alternative that was rejected and why; and what is knowingly left undone.
