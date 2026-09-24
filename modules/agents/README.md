# @specwarden/agents

▸ **module** — Coding-agent role definitions.

Every agent declares its name, description, tools and model; its name matches its file; and only an orchestrator may spawn another.

## What a module is

An opinion a repository chooses. It could be wrong about a repository that has never heard of it, which is exactly why it is not in the engine.

## Install

```bash
pnpm add -D specwarden @specwarden/agents
```

It depends on [`specwarden`](https://github.com/specwarden/specwarden/tree/main/core#readme).

## Documentation

- [GUIDE.md](https://github.com/specwarden/specwarden/blob/main/modules/agents/GUIDE.md) — how to use it, from the install to a green run
- [What specwarden is](https://github.com/specwarden/specwarden#readme) — the failure it exists against
- [ARCHITECTURE.md](https://github.com/specwarden/specwarden/blob/main/ARCHITECTURE.md) — how the packages divide the work
- [CONTRIBUTING.md](https://github.com/specwarden/specwarden/blob/main/CONTRIBUTING.md) — running the repository, and how a release is cut

<!-- GENERATED from scripts/registry.mjs. Edit the registry, then run `pnpm scaffold`. -->
