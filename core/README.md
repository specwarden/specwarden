# specwarden

◆ **core** — A repository declares its rules; specwarden proves which hold.

Ports, primitives, the runner and the CLI, plus the self-checks, which audit the declarations: zones, ratchets and the rule register.

## What a core is

One, unscoped. Everything depends on it; it depends on nothing, and it knows no repository.

## Install

```bash
pnpm add -D specwarden
npx specwarden adopt      # what this repository already is — reads, writes nothing
npx specwarden init       # write the starting tree
npx specwarden check      # what the changed files make relevant
```

## Documentation

- [GUIDE.md](https://github.com/specwarden/specwarden/blob/main/core/GUIDE.md) — how to use it, from the install to a green run
- [What specwarden is](https://github.com/specwarden/specwarden#readme) — the failure it exists against
- [ARCHITECTURE.md](https://github.com/specwarden/specwarden/blob/main/ARCHITECTURE.md) — how the packages divide the work
- [CONTRIBUTING.md](https://github.com/specwarden/specwarden/blob/main/CONTRIBUTING.md) — running the repository, and how a release is cut

<!-- GENERATED from scripts/registry.mjs. Edit the registry, then run `pnpm scaffold`. -->
