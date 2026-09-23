---
'@specwarden/docs': minor
'@specwarden/plans': minor
'@specwarden/ops': minor
'@specwarden/security': minor
'@specwarden/agents': minor
'@specwarden/openspec': minor
'@specwarden/speckit': minor
'@specwarden/plugin-nestjs': minor
---

Every factory in these packages now checks its options when the check file (or the config) loads: a required option that is missing, an option of the wrong kind, and an option the factory does not have are each refused by name — factory, check id and option — instead of being dropped. A misspelled option used to be ignored in silence, and the check ran as if it had never been given: `skipped:` for `docPaths`' `skipDirs`, `agents:` for `agentDefinitions`' `agentsDir`, `arbiter:` for `gatesHaveCiJobs`' `arbiterJob`, `plans:` and `statuses:` on `planShape`.

If your run now stops at load naming an option, that option never reached the check. Rename it to the one the error lists (each factory's options are in a table in its GUIDE), or delete it.

Also in every factory here: `tier` is optional and defaults to `fast`, and `when` is optional and means "always relevant". On `@specwarden/ops` `when` was required and passed through untouched, so a check wired without one crashed every relevance-filtered run — pre-push, pull request — with "when is not a function".
