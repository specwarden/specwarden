---
'specwarden': patch
---

`check --tighten` records a measurement only from a PASSING verdict, and never past the ceiling the check declares with `ratchet` (never below a declared floor, for an `up` ratchet). A red run at 3 over a bar of 0 was recorded as the new threshold, so the next run was green; a run at 4 over a ceiling of 3 wrote 4, and `ratchet-direction` then refused the file. Nothing changes for a run that passes within its ceiling.
