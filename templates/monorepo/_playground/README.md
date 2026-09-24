# monorepo playground

`repository/` pretends to be a pnpm WORKSPACE of its own — `acme-platform`, three
packages, its own lockfile, lint, tests and CI workflow — a workspace that is its own
root, not a bare directory nested inside another one.

`.specwarden/` there is exactly what `init --template monorepo` writes today: generated
by `node scripts/playgrounds.mjs --write monorepo`, never edited by hand. `build-order`,
`dependency-pins` and `ci-coverage` ship as `.example` — each needs a policy or a fact
only a real workspace has — and are proved separately, by the template's own unit suite
importing and constructing them.

## What each defect proves

| Check | Plants | Says |
| --- | --- | --- |
| `secret-scan` | a deploy key committed inside one of the packages | `packages/api/src/deploy.ts` |
| `doc-paths` | the architecture note naming a source file that was split and renamed | `packages/money/src/allocate.ts` |
| `lint` | a package reaching into another's `src` by path instead of importing it by name | `pnpm run lint` |
| `lockfile` | a manifest that gained a dependency its lockfile does not know about | `pnpm install --frozen-lockfile` |
| `unit` | an allocation that loses a cent — the workspace's own test catches it | `pnpm test` |

## Regenerating

After changing the template: `pnpm --filter @specwarden/template-monorepo build`, then
`node scripts/playgrounds.mjs --write monorepo` — review the `.specwarden/` diff before
committing it.
