---
'specwarden': minor
---

**Verdict change, a fix:** a tree whose `.specwarden/rules.mjs` the config did not import now has the four rule audits on, and `orphan-check` or `rule-owner-resolves` may go red with nothing else changed. The register looked declared and was audited by nobody; what turns red is what those audits exist to find.

- A `rules.mjs` beside the config (or `rules/rules.mjs`) is the rule register when the config names no `rules`. It sat there read by nothing, and the four rule audits were off — a register that looked declared and was not. A config naming `rules` still wins; a `rules.mjs` exporting no array is a load error naming the file. `doctor` and `check --list` say where the register came from.
- The harness's own rule is owned by `.specwarden/README.md` when that README exists, and by the engine when it does not. A hand-written tree declaring `rules: []` met a red `rule-owner-resolves` over machinery it never declared. `harness.ruleOwner` still wins.
