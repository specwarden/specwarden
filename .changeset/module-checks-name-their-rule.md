---
'specwarden': minor
'@specwarden/docs': minor
'@specwarden/plans': minor
'@specwarden/ops': minor
'@specwarden/security': minor
'@specwarden/agents': minor
---

**Verdict change, looser:** `orphan-check` no longer reports a module check wired without a `rule` — the check carries the rule it enforces. A house that used `orphan-check` to force a rule of its own onto every module check writes `rule` on those checks; a register entry naming the check replaces the implied rule. `rule-owner-resolves` accepts a scoped package the root `package.json` depends on as an owner, where it looked for a file of that name.

A module's check names the rule it enforces. Wired by its GUIDE with no `rule`, every module check was an orphan the moment a register existed — and a preset's checks (`docsChecks`, `planChecks`) had nowhere to put one.

- Every factory in `@specwarden/docs`, `plans`, `ops`, `security` and `agents` supplies a rule, owned by its package and marked `implied`. A `rule` the consumer writes replaces it. A check's `title` now defaults to that rule's statement.
- `ICheckRule.implied`: an implied rule yields to the register. It is dropped where a register rule already names the check, and is never refused as a duplicate of a register rule with its id.
- `rule-owner-resolves` accepts a scoped package name (`@specwarden/docs`) as an owner when the root `package.json` depends on it: the reasoning ships in that package, not in a document the repository holds. A scoped name nothing depends on is still looked up as a path.
