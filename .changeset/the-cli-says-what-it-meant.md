---
'specwarden': minor
---

- An unknown `--id`, a `SPECWARDEN_SKIP` id or a command close to a known one says which: `unknown check id 'no-tod' — did you mean 'no-todo'?`.
- `doctor --json` prints the report as one document — each check with its tier, zone, capabilities, flags, file and rule, the denied capabilities, ownership and rule coverage — with the same exit code as the text. `--json` was accepted and ignored.
- `doctor` names the engine's own rule beside the count: `declared: 1 (the engine's own: harness-integrity)`. An empty `rules.mjs` printed "declared: 1, enforced: 1", a rule nobody could find.
- **Behaviour change, a fix:** `specwarden new <id>` before `init` exits 2 and names `init`. It wrote a check under a `.specwarden/` that `check` then refused as having no config.
- The `doctor --json` document carries `version: 1`, the shape a script can hold it to; `ownership` and `rules` are present only when declared.
