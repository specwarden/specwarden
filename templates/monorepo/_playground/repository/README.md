# acme-platform

One pnpm workspace, three packages, each built in dependency order:

| Package          | What it is                                         |
| ---------------- | -------------------------------------------------- |
| `packages/money` | integer money: amounts, currencies, rounding       |
| `packages/api`   | the HTTP api, which prices everything with `money` |
| `packages/web`   | the client, which formats what the api returns     |

A package imports another by its name — `@acme/money` — never by a path into its `src`.
`pnpm install --frozen-lockfile` is what CI runs, so a manifest changed without its
lockfile fails the build rather than the deploy. The pipeline is in
`.github/workflows/ci.yml`; architecture notes are in `docs/architecture.md`.

The engine packages are linked from the repository this playground lives in rather than
installed from npm — the one thing here that a real workspace would not do.
