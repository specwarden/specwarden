---
description: Run this repository's own gates, and read the result the way the engine intends.
argument-hint: '[gate id or package, to narrow]'
allowed-tools: Bash, Read, Grep, Glob
---

Run the gates for **specwarden** and report honestly. Narrowing argument (may be empty):
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

- a gate id → `pnpm gate --id <id>`
- a package → `pnpm --filter <pkg> test:coverage` (its suite, its playground, its ratchet)
- a template → the same, plus `node scripts/playgrounds.mjs`
- `scripts` → `pnpm exec vitest run`

## Reading a failure

In this order:

1. the finding's own message — every check here is written to say what to do;
2. the `💡` hint under the failed gate;
3. the rule the check names, and the `SKILL.md` that owns it.

Then check the COUNT each gate printed. `0` of anything, or far fewer than last time, is a
filter that matched nothing — the failure this product is named after — not a clean tree.

## Never

Make a run green by lowering a ratchet or a threshold, adding an exemption, loosening an
assertion, or deleting a playground defect. That is the bar moving. If a gate is itself
wrong, say so explicitly and fix the gate — with a spec that shows the case it got wrong.
