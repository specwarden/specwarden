# .specwarden/

This repository's own facts. The engine is the package; everything here is yours.

```
.specwarden/
  warden.config.mjs   the ENTRY — only what the tree cannot say for itself
  rules.mjs           what this repository has decided, and who owns each decision
  checks/             one file per check, by family; the engine discovers them
  perimeter.mjs       what an assistant may not do here (optional)
  relevance.mjs       which paths a gate cares about, when a diff should skip it (optional)
  ratchets/           DATA, written by --tighten — commit it
  baseline/           DATA — same reasoning
```

Every declaration above may instead live in its OWN FOLDER together with its test —
`perimeter/perimeter.mjs` beside `perimeter/perimeter.test.mjs`, the folder named for the
stem before the first dot. The engine resolves both layouts, so a house style that keeps a
tested file and its test together does not have to argue with the CLI. A check under
`checks/` is discovered at any depth and needs no permission at all.

## The one rule about this folder

**Repository facts live here; the engine never learns them.** A workspace name, a
table, a vendor, a directory layout — all of it belongs on this side. That boundary is
what lets the engine be upgraded without re-learning your repository, and it is
enforced: a product source naming a host literal fails its own zone check.

## Getting further

- `specwarden check --all` — run everything, ignoring relevance filtering.
- `specwarden check --list` — the manifest: every check the engine found, in run order.
- `specwarden doctor` — what is declared, without running any of it.
- `specwarden suggest` — rules this repository already follows, each ratchet set to
  current reality. Nothing is enabled for you.
- `specwarden check --tighten` — lower every ratchet to today's count, so the next
  regression fails.
- `specwarden check --jobs 4` — overlap the work; a check that cannot share the machine
  declares `exclusive: true`.
