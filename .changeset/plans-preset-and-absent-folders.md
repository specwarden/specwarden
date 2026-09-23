---
'@specwarden/plans': minor
---

`planChecks({ plansDir, archiveDir })` returns `plan-staleness`, `plan-shape` and `decision-log-shape` with their conventional ids over one plans folder; each takes its own options (`staleness`, `shape`, `decisions`) or `false`. Every option now has a default: `plansDir` is `docs/_plans`, `archiveDir` is `docs/_plans-archive`, `decisionLogShape`'s `docs` is the plans in that folder, and `planShape`'s `nameRe`, `sizingPatterns`, `phaseHeadingRe` and `commandRe` are the English convention, exported as `DEFAULT_PLAN_NAME`, `DEFAULT_SIZING`, `DEFAULT_PHASE_HEADING` and `DEFAULT_COMMAND`. The default acceptance line is a command (`pnpm`, `npm`, `npx`, `node`, `bash`, `make`, …) or an `**Acceptance.**` line. `planStaleness` now takes `rule`, `ratchet` and the rest of the engine's identity.

Verdict changes. A plans folder that does not exist now FAILS `planStaleness` and `planShape`, naming the folder and `plansDir` — they passed, with a green tick and with "nothing to verify". A folder that exists and holds no plan still passes, and now says `no plan in <dir> — nothing in flight`. A missing archive folder is not a failure. And a RELATIVE link into the archive, `[done](./_plans-archive/done.md)`, is now caught as a citation, like the archive's path written out; it was invisible.
