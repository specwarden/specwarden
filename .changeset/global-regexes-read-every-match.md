---
'@specwarden/security': patch
'@specwarden/plans': patch
'@specwarden/openspec': patch
'@specwarden/speckit': patch
'@specwarden/docs': patch
'@specwarden/ops': patch
---

Checks no longer skip every second match when handed a regular expression with the `/g` flag. A global regex keeps its position between calls, so it silently missed every other line it was tested against:

- `secretScan` missed every second credential in a file, through `patterns.extra` and placeholder markers;
- `planStaleness` read every second plan as having no status;
- the OpenSpec source did not see every second requirement heading;
- `docCounts` misread every second dated line or skipped path, looped forever on a menu `reference` pattern without `/g`, and threw on a menu pattern without it.

A `secretScan` that goes red after upgrading has found a credential that was always there. Also fixed:

- `buildOrderFollowsDeps` with a stale `scopePrefix` now fails; it passed having compared nothing.
- `envFilesAgree` substitutes every `${MODE}` in a path, not the first; the mode was reported SKIPPED over files that existed.
- The Spec Kit and OpenSpec sources say so when they find nothing, as their contract requires.
- `docSymbols` names the language it read.
- `docHygiene` no longer points consumers at a document their repository does not have.
