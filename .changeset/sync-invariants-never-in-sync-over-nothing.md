---
'specwarden': patch
---

`specwarden sync-invariants` no longer prints "✓ in sync" when the spec source was found but holds no requirements. With nothing to deposit and nothing orphaned it reported agreement over an empty corpus; it now says the source holds no requirements, and repeats the adapter's note on why.
