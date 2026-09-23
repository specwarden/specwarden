---
description: Change a generated file through its source, regenerate, and review what changed.
argument-hint: '<what should change, and in which package>'
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

Generated-file work in **specwarden**: `$ARGUMENTS`

## The rule

`scripts/registry.mjs` is the single declaration of every package. These are DERIVED from
it, and a direct edit does not survive the next run: every package's `package.json`,
`tsconfig.json`, `vitest.config.ts`, `tsup.config.ts`, `README.md` and `LICENSE`; the root
README's package table; `llms.txt`; every plugin manifest, every `reference.md`, the
marketplace. `CLAUDE.md` derives from `AGENTS.md`; a template playground's `.specwarden/`
derives from its template (`/playground` owns that loop).

So: edit the registry or the generator, then regenerate. Never the output.

## The loop

```bash
pnpm format && pnpm scaffold    # format FIRST — reference.md is a byte copy of GUIDE.md
git diff                        # every line of it should be explained by the edit
pnpm install                    # if a dependency changed
pnpm gate:fast                  # scaffold-drift and the lockfile are in it
```

A diff you did not expect means somebody edited a generated file by hand. That edit is gone
now — which is the point — but find out what it was trying to achieve and put it in the
registry instead.

## Common edits

- **A dependency** — a sibling a package imports at runtime goes in its registry `deps`; a
  test-only one in `devDeps`. The engine is implied for every kind but `core`.
- **A coverage ratchet** — the package's `coverage` entry. It only rises: the measurement
  minus one point, floored, with the date it was measured.
- **A new package** — `skills/structure/SKILL.md` §5; it also owes a playground
  (`pnpm gate --id package-playgrounds` says which shape).

Commit the registry change and the regenerated output TOGETHER.
