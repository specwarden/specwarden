---
name: publishing
description: Versions, changesets, what ships in a tarball, and how a release is cut.
---

# publishing

## 1. The window is 72 hours and exists once

A version published without a licence, with a description left over from another package,
or with `bin` missing from `files`, can be unpublished exactly once in that version's
life. For all the rest of the time the consumer sees what shipped.

That is why publish readiness is a gate rather than something noticed at publish time.

## 2. A version comes from a changeset

```bash
pnpm changeset          # describe the change, pick the packages and the bump
pnpm version:packages   # changesets writes the versions and the changelogs
```

The scaffolder **reads** a version and never writes one, so a hand-edited number is
reverted by the next `pnpm scaffold` rather than released. That is the mechanised half of
a rule whose other half is a judgement: which changes are user-visible is what the
changeset exists to record, and no check can decide it.

## 3. What ships

`files` decides the tarball, and the two ways it goes wrong are opposite:

- **missing `dist`** publishes a package with no code — and locally everything looks
  right, because locally `dist` is there;
- **missing `bin`** publishes a command whose entry point is not in the tarball, so the
  install succeeds and the first invocation fails on a path the user cannot see.

The engine ships `bin/` and `scripts/` **uncompiled**: the CLI shim is deliberately
build-free ESM so it runs in a fresh clone before anything exists, which is the very
danger it guards against.

## 4. `verify-build` is the only honest proof

"The build works" is unfalsifiable until somebody installs the result. Asserting that
`dist/index.js` exists proves a file exists.

`pnpm verify:build` packs every package, installs the **tarballs** into a temporary
project, imports a named symbol from each, and starts the CLI. A folder link would pick
up files a published package never contains; a tarball is assembled from `files` — what
actually ships.

## 5. Cutting a release

```bash
pnpm release
```

It runs `pnpm check`, then the publish-readiness gate with `--releasing`, then publishes.
The order is the point: a manual release cannot skip what CI runs for it.

`--releasing` is what turns on the rules that only matter at that moment — a version
still at `0.0.0`, for instance. Failing on those always would paint the whole pre-release
period red and teach everybody to run `check` with something skipped, and the findings
beside it would go with it.
