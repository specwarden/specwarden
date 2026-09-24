---
description: Change what a template writes, or the repository its playground models — then regenerate and review the tree a consumer receives.
argument-hint: '<template name, and what should change>'
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

Template work in **specwarden**: `$ARGUMENTS`

`skills/playgrounds/SKILL.md` owns the rules; `_playgrounds/README.md` says what each kind of
playground proves. For anything beyond a one-line change, spawn `template-author`.

## The three things a template change touches

1. **The template or the part** — `templates/<name>/src/` or `templates/_parts/src/`. A
   template is a list of decisions; the file bodies live in parts.
2. **The template's repository** — `templates/<name>/_playground/repository/`, a repository
   of the kind the template is for. `init` DETECTS what it writes for (compose file, workflow,
   tracked shell, `test`/`lint` scripts, a spec framework), so a new detection needs the file
   that triggers it here, or the part is never written into any tree.
3. **The proof** — `templates/<name>/_playground/playground.spec.ts`: one defect per check
   the template writes. A new check fails the proof until its defect exists, by design.

## The loop

```bash
pnpm --filter @specwarden/template-<name> build   # init imports the BUILT template
node scripts/playgrounds.mjs --write <name>       # regenerate its .specwarden/
git diff templates/<name>/_playground/repository/.specwarden/
pnpm --filter @specwarden/template-<name> test    # unit spec + playground proof
pnpm gate --id playgrounds
```

Read the `.specwarden/` diff line by line: it is exactly what a consumer's repository will
receive, and no compiler has read it. Never edit it by hand — the `playgrounds` check fails on the next run.

## Planting a defect

`planted(text, from, to)`, never a bare `.replace` — a phrase that is not in the file plants
nothing, and the scene then reads as "the check missed it". Change only what the check is
about, and plant it where the check looks.

## Then

A change a consumer who already scaffolded would need to copy by hand gets a changeset for
the template, telling them the edit. What `init` wrote is theirs; no upgrade reaches it.
