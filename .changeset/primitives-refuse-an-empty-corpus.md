---
'specwarden': minor
---

`forbidPattern`, `forbidImport`, `referencesResolve`, `sourcesAgree` and `zoneBoundary` now fail when their glob matched nothing (or, for `sourcesAgree`, when neither source described a single name), naming the glob. Each passed in silence before: a ban over zero files bans nothing, and a barrier sweeping no source is not a barrier. A clean pass now also says how many files it examined.

A check that goes red for you after upgrading is pointing its glob at nothing — the rule it states was not being enforced. Fix the glob, or declare that an empty set is expected with `corpus: { atLeast: 0 }` on the check.
