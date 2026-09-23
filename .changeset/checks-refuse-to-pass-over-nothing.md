---
'@specwarden/docs': minor
'@specwarden/plans': minor
'@specwarden/security': minor
---

A check that examined no files now fails and names the pathspec that matched nothing, instead of passing: `docPaths`, `docHygiene`, `docPlacement`, `docSymbols` (both its document and its code corpus), `decisionLogShape` and `secretScan`. A pathspec that matches nothing is the commonest way a check stops checking, and a green run over zero files looked exactly like a clean tree. If one of these goes red for you after upgrading, its pathspec is pointing at nothing — fix the pathspec; the check was not running before.

`agentDefinitions` and `planShape` over a folder that exists but is empty now say "nothing to verify" rather than passing without a word, and `planShape` no longer crashes when its `plansDir` is a file.
