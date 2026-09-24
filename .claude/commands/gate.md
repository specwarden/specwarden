---
description: Run this repository's gate — its own checks — and read the result the way the engine intends.
argument-hint: '[check id or package, to narrow]'
allowed-tools: Bash, Read, Grep, Glob
---

Run **specwarden**'s own checks and report honestly. Narrowing argument (may be empty):
`$ARGUMENTS`

## With no argument

```bash
pnpm build             # the CLI refuses a dist older than its sources
pnpm gate:fast         # everything that only reads files
pnpm gate              # both tiers — builds, packs, runs every playground
```

`gate:fast` first: a failure there is about this change rather than about the machine. The
heavy tier is where a change to what ships — a manifest, an export, a template — surfaces.

## With an argument

Run only what it names, then say what you did NOT run:

- a check id → `pnpm gate --id <id>`
- a package → `pnpm --filter <pkg> test:coverage` (its suite, its playground, its ratchet)
- a template → the same, plus `node scripts/playgrounds.mjs`
- `scripts` → `pnpm exec vitest run`

## Reading a failure

In this order:

1. the finding's own message — every check here is written to say what to do;
2. the `💡` hint under the failed check;
3. the rule the check names, and the `SKILL.md` that owns it.

Then read the COUNT each check printed. `0` of anything, or far fewer than last time, is a
filter that matched nothing — the failure this product is named after — not a clean tree.

## Never

Make a run green by lowering a ratchet or a threshold, adding an exemption, loosening an
assertion, or deleting a playground defect. That is the bar moving. If a check is itself
wrong, say so explicitly and fix the check — with a spec that shows the case it got wrong.
