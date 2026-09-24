# .specwarden/

This repository's own checks and rules. The engine is the package; everything here is yours.

```
.specwarden/
  config.mjs      the entry — only what the tree cannot say for itself
  rules.mjs       the rules no single check states, and each example's rule, commented out
  README.md       this file
  perimeter.mjs   what an assistant may not do here, checked by a hook before the action runs
  checks/         one file per check, by family; the engine discovers every *.check.mjs
```

A check states the rule it enforces (`rule: '…'`), and its file owns that rule.
`specwarden check --tighten` writes a ratchets folder here the first time a ratchet has
something to hold — commit it.

## Getting further

- `specwarden check --all` — run everything, ignoring relevance filtering.
- `specwarden check --list` — every check the engine found, in run order.
- `specwarden doctor` — what is declared, without running any of it.
- `specwarden check --tighten` — lower every ratchet to today's count, so the next
  regression fails.
