# docs-only playground

`repository/` pretends to be a platform team's handbook — onboarding, runbooks,
decisions — the kind of repository whose product IS its documents, where a path that
stops resolving is a runbook nobody can find during the incident that needed it.

`.specwarden/` there is exactly what `init --template docs-only` writes today: generated
by `node scripts/playgrounds.mjs --write docs-only`, never edited by hand. `doc-counts`
and `doc-placement` ship as `.example` — counts and placement need facts only a real
repository has — and are proved separately, by the template's own unit suite importing
and constructing them.

## What each defect proves

| Check | Plants | Says |
| --- | --- | --- |
| `doc-paths` | an onboarding page naming a runbook that was renamed | `docs/runbooks/drain-the-consumer.md` |
| `doc-hygiene` | a runbook index linking to a page that was never written | `./escalate-an-incident.md` |

## Regenerating

After changing the template: `pnpm --filter @specwarden/template-docs-only build`, then
`node scripts/playgrounds.mjs --write docs-only` — review the `.specwarden/` diff before
committing it.
