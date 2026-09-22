# @specwarden/ops

▸ **module** — Env files, proxy upstreams, CI coverage, build order, shell scoping.

The operational seams: every heavy gate has a CI job, every env file agrees with its siblings, and a Dockerfile builds its dependencies first.

## What a module is

An opinion a repository chooses. It could be wrong about a repository that has never heard of it, which is exactly why it is not in the engine.

## Install

```bash
npm install @specwarden/ops specwarden
```

It depends on [`specwarden`](https://github.com/specwarden/specwarden/tree/main/core#readme).

## Documentation

- [What specwarden is](https://github.com/specwarden/specwarden#readme) — the failure it exists against
- [ARCHITECTURE.md](https://github.com/specwarden/specwarden/blob/main/ARCHITECTURE.md) — how the packages divide the work
- [CONTRIBUTING.md](https://github.com/specwarden/specwarden/blob/main/CONTRIBUTING.md) — running the repository, and how a release is cut

<!-- GENERATED from scripts/registry.mjs. Edit the registry, then run `pnpm scaffold`. -->
