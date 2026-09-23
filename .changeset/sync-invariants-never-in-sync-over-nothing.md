---
'specwarden': patch
---

**Behaviour change, a fix:** `sync-invariants` exits 2 when the spec source could not be read (no `openspec/specs`, no `specs/`, no plans folder for `native`). It exited 0 beside a note saying "this is not a green light", so a CI step reconciled against nothing and passed.

`specwarden sync-invariants` no longer prints "✓ in sync" when the spec source was found but holds no requirements. With nothing to deposit and nothing orphaned it reported agreement over an empty corpus; it now says the source holds no requirements, and repeats the adapter's note on why.
