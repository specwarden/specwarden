---
'specwarden': patch
---

- `uncoveredFactories` recognises a factory that refuses the probe with a `CheckOptionsError`, and one that returns an array of checks or a plugin carrying `checks`. It throws a `FactoryAuditError` (exported from `specwarden`) when a claim names factories and none of them is recognised — the audit found nothing and reported nothing uncovered, a green run over a package it never read.
- `sync-invariants` reads `invariants.docs` from the files git tracks, the corpus every check reads. A working-tree glob over `**/*.md` counted a marker inside `node_modules/` as an invariant this repository deposited.
