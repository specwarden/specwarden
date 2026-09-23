---
'specwarden': patch
---

- `rule-owner-resolves` reports a rule with no owner by name, instead of failing with "Cannot read properties of undefined (reading 'split')".
- `orphan-check`'s hint names the smallest fix first: add `rule: '…'` to the check.
- `migrate` refuses a config version older than any that existed (`version: 0`), exit 2 — it exited 0 over a migration that did not happen.
- `sync-invariants` ends a spec source's note once: "…elsewhere.. (This" and "…here?. (This" no longer double their punctuation.
