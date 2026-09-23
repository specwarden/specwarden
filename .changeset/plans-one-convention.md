---
'specwarden': minor
---

One plan convention for `plan status` and `@specwarden/plans`:

- A phase's acceptance is an `**Acceptance.**` or `**Acceptance:**` line, OR a fenced `bash`/`sh` block under the phase heading, whichever comes first; a block of several commands is chained with `&&`. A phase ends at the next `#` or `##` section.
- Backticks wrapping an inline acceptance are stripped before the shell sees them — the shell read them as command substitution.
- The status vocabulary is `draft` / `active` / `done`: `PLAN_STATUSES` and `TPlanStatus` gain `done`, and `computeLifecycle` reads a `done` plan as `spent`. A plan that declares no status prints as `undeclared`, never as `draft`; `parsePlan` returns the declared status as `declared`.
- `plan status --verify` prints the last lines a failing acceptance printed.
- `plan archive` refuses a plan whose archive header lacks `**Started:**`, `**Finished:**`, `**Branch:**`, `**Harvested:**` or `**Left open:**`, naming the missing fields — it said "ready", and the moved entry was then refused by the plans module. `ARCHIVE_HEADER_FIELDS` and `missingArchiveHeader` are exported.
