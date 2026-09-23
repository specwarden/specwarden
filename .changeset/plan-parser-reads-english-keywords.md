---
'specwarden': minor
---

`specwarden plan` reads English plan keywords only — `**Status:**`, `**Branch:**`, `## Phase N — …`, `**Acceptance.**`. It also accepted one other language's spellings, which put one house's plan vocabulary inside the engine. A plan written with other keywords is now reported as having no status and no phases rather than parsed; to keep checking such plans, configure `@specwarden/plans` with your own `phaseHeadingRe` and declaration patterns.
