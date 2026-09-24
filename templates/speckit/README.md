# @specwarden/template-speckit

⚒ **template** — A repository specified with Spec Kit — the spec source wired, credential scan, doc paths, lint and tests.

The same as the OpenSpec template, against the other tool.

## What a template is

A starting tree for one kind of repository, so day one is one command rather than a blank file. It emits ordinary files the repository then owns.

## Install

```bash
pnpm add -D specwarden @specwarden/template-speckit @specwarden/speckit @specwarden/security @specwarden/docs
npx specwarden init --template speckit
```

It depends on [`specwarden`](https://github.com/specwarden/specwarden/tree/main/core#readme), [`@specwarden/scaffold-parts`](https://github.com/specwarden/specwarden/tree/main/templates/_parts#readme), [`@specwarden/speckit`](https://github.com/specwarden/specwarden/tree/main/modules/speckit#readme), [`@specwarden/security`](https://github.com/specwarden/specwarden/tree/main/modules/security#readme), [`@specwarden/docs`](https://github.com/specwarden/specwarden/tree/main/modules/docs#readme).

## Documentation

- [What specwarden is](https://github.com/specwarden/specwarden#readme) — the failure it exists against
- [ARCHITECTURE.md](https://github.com/specwarden/specwarden/blob/main/ARCHITECTURE.md) — how the packages divide the work
- [CONTRIBUTING.md](https://github.com/specwarden/specwarden/blob/main/CONTRIBUTING.md) — running the repository, and how a release is cut

<!-- GENERATED from scripts/registry.mjs. Edit the registry, then run `pnpm scaffold`. -->
