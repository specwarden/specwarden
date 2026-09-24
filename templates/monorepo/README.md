# @specwarden/template-monorepo

⚒ **template** — A pnpm workspace — lockfile, credential scan, documentation paths; build order, dependency pins and CI coverage as examples.

What a workspace can get wrong that a single package cannot: a stale lockfile, a Dockerfile that builds out of order, a heavy check with no CI job.

## What a template is

A starting tree for one kind of repository, so day one is one command rather than a blank file. It emits ordinary files the repository then owns.

## Install

```bash
pnpm add -D specwarden @specwarden/template-monorepo @specwarden/ops @specwarden/security @specwarden/docs
npx specwarden init --template monorepo
```

It depends on [`specwarden`](https://github.com/specwarden/specwarden/tree/main/core#readme), [`@specwarden/scaffold-parts`](https://github.com/specwarden/specwarden/tree/main/templates/_parts#readme), [`@specwarden/ops`](https://github.com/specwarden/specwarden/tree/main/modules/ops#readme), [`@specwarden/security`](https://github.com/specwarden/specwarden/tree/main/modules/security#readme), [`@specwarden/docs`](https://github.com/specwarden/specwarden/tree/main/modules/docs#readme).

## Documentation

- [What specwarden is](https://github.com/specwarden/specwarden#readme) — the failure it exists against
- [ARCHITECTURE.md](https://github.com/specwarden/specwarden/blob/main/ARCHITECTURE.md) — how the packages divide the work
- [CONTRIBUTING.md](https://github.com/specwarden/specwarden/blob/main/CONTRIBUTING.md) — running the repository, and how a release is cut

<!-- GENERATED from scripts/registry.mjs. Edit the registry, then run `pnpm scaffold`. -->
