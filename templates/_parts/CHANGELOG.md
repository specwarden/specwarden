# @specwarden/scaffold-parts

## 0.2.0

### Minor Changes

- 33bc7fb: The files a check reads through `ctx.files.glob` (and `readAll`, check discovery, and `adopt`/`suggest` outside git) are now listed by specwarden's own glob on every Node, with the semantics Node 24.21's `fs.globSync` has, instead of by whichever runtime runs it. A check may now report findings in files its pattern names and the old glob skipped — that is the check reading what it was pointed at, not your code changing. Where your Node's own glob answered differently from 24.21, the verdict moves:

  - **Node 22.0–22.22.0, 24.0–24.13.0, 25.0–25.3**: a dot directory named after `**` is read — `**/.github/workflows/*.yml` finds the workflows it skipped.
  - **Node 22.x, 24.0–24.20, 25.x, 26.0–26.7**: sibling entries a native early return skipped are read.
  - **Node 26.9 and newer**: a segment after `**` that names a directory LINK is followed one level into it again, as on 24.21 — `**/*` and `./**/*.md` reach `node_modules/<dep>/README.md` in a pnpm install. `**` itself still never enters a link, so `**/*.md` reads no dependency.
  - **Node 24.21 and 26.8**: nothing moves.

  Also in this release:

  - **Runs on Node 18.18.0 and newer**, down from 24. Every package declares `>=18.18.0`, is built for it, and is proved on 18.18, 20 and 22 in CI. Below the floor the CLI refuses with one sentence naming the version it needs, and exits 1.
  - **The testing kit globs as the disk does.** `runCheck`, `testContext` and `InMemoryFileSource` now expand braces (`src/**/*.{ts,tsx}`), classes and extglobs, read `a/../b` and `a/./b` as `a/b`, and match a trailing `/` against directories only. Before, they read those as text — so a test naming `app/[slug]/page.tsx` literally matched it in the kit, where the disk never did (write `app/[[]slug]/page.tsx`). The kit ignores case on no platform, and holds no links; the disk ignores case on Windows and macOS in a wildcard segment.
  - **An extglob inside an extglob** (`!(*(a|aa))b`) is refused with a message naming the segment, rather than read differently from Node or backtracking for seconds on a long name.
  - **Brace expansion stops where Node's does**: 100,000 patterns, or 4,000,000 characters across them.
  - **A count ratchet recorded on an affected Node** may read higher once, because its baseline counted files the old glob never listed. Raising it that one time is correct: the stored number was measured blind.
  - Install every `@specwarden/*` package at 0.2.x together with `specwarden` 0.2.x.
  - The engine guide's `commandCheck` example is now `node --test --test-reporter=tap` with `cwd: 'tests'`: its quoted glob was expanded by the runner only from Node 21.

### Patch Changes

- Updated dependencies [33bc7fb]
  - specwarden@0.2.0

## 0.1.0

### Minor Changes

- The first public release. The pieces every template is assembled from.

  One piece a template is assembled from: the check or checks it writes, the rule they enforce, and where one is needed the config field that makes the two resolve.
