---
'specwarden': patch
'@specwarden/ops': patch
'@specwarden/docs': patch
'@specwarden/plans': patch
'@specwarden/agents': patch
'@specwarden/security': patch
'@specwarden/speckit': patch
'@specwarden/plugin-nestjs': patch
---

The words printed and shipped are the glossary's. No verdict changes; only the wording of these outputs, so a CI job matching the old text on stderr or in a finding should match the new:

- A check declaring a tier outside the config's `tiers` is refused with "A tier outside the vocabulary is no tier a run can select, so no `--tier` would ever run it." (was `… is in no schedule, …`).
- `commandCheck` over a `paths` entry that does not exist ends `… so this would have been a green check over a shrinking subject.` (was `a green gate`).
- `zone-boundary` reports `<file> names the consumer literal <label> — …` (was `the host literal`), and its title is `a product source names no consumer literal and never imports the consumer zone`.
- `ciCoverage` over a workflow naming no check it can read suggests `check: [a, b]` in a matrix, `{ check: a }`, or `--id a`. A `gate:` matrix key is still read.
- The engine's description, its shipped skill and every module's GUIDE and skill say specwarden (never "the warden"), check (never "gate" for one check), self-checks (never "harness"), CI (never "arbiter"), and consumer (never "host" or "house").
