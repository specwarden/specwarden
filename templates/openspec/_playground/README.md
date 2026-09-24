# openspec playground

`repository/` pretends to be a small shop's checkout and refunds, specified with
OpenSpec: two capabilities under `repository/openspec/specs/`, with requirements and scenarios, and
a change in flight under `repository/openspec/changes/` with its own tasks.

`.specwarden/` there is exactly what `init --template openspec` writes today: generated
by `node scripts/playgrounds.mjs --write openspec`, never edited by hand.

## What each defect proves

| Check | Plants | Says |
| --- | --- | --- |
| `doc-paths` | a change proposal naming a module that does not exist | `src/payments.ts` |
| `secret-scan` | a payment provider key committed with the checkout code | `src/provider.ts` |

Beside the checks, `sync-invariants` over this tree is proved directly (not through
`provePlayground`, since reconciling a spec source is not a check): every requirement is
read and proposed for deposit, and the command says it FOUND NOTHING — never "in sync" —
when the specs directory is gone or the headings are worded another way.

## Regenerating

After changing the template: `pnpm --filter @specwarden/template-openspec build`, then
`node scripts/playgrounds.mjs --write openspec` — review the `.specwarden/` diff before
committing it.
