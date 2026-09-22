---
description: Regenerate everything derived from the package registry, and review what changed.
---

Run `pnpm scaffold`, then read the diff.

Everything it writes is derived from `scripts/registry.mjs`: manifests, tsconfigs, build
configs, package READMEs, licences, plugin manifests, the marketplace and the root
README's package table.

A diff you did not expect means somebody edited a generated file by hand. That edit is
now gone — which is the point — but find out what it was trying to achieve and put it in
the registry instead.

For the playgrounds: `node scripts/playgrounds.mjs --write`, then review. A template's
output is reviewed in that diff and nowhere else.
