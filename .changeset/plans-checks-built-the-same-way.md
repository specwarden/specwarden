---
'@specwarden/plans': minor
---

**Behaviour changes, fixes:** `planShape` and `planStaleness` are held to the stored ratchet threshold, and state what they measured — `planStaleness` reported undeclared plans only as notes, so `--tighten` stored 0 over the plans it had been tolerating. The preset applies `tier` and `when` to every check; it accepted both and built every check in `fast`.

- **Renames.** `planChecks` → `plansChecks`, `IPlanChecksOptions` → `IPlansChecksOptions`; its override `decisions` → `decisionLog`. `planShape`'s patterns lose their suffix: `nameRe` → `name`, `phaseHeadingRe` → `phaseHeading`, `commandRe` → `command`, `sizingPatterns` → `sizing`; `DEFAULT_PLAN_NAME` → `DEFAULT_NAME`; `knownGateIds` → `knownCheckIds`.
- **Identity.** Every factory takes the engine's module declaration: the id defaults to `plan-staleness`, `plan-shape`, `decision-log-shape`, the title to the rule the package implies, and `zone` is refused. `planStaleness()`, `planShape()` and `decisionLogShape()` need no options.
- **One ratchet.** `ratchet` is the engine's on every check. `planShape` counts sizing and unaccepted phases against it together (`sizingRatchet`, `unacceptedRatchet` are gone); `planStaleness` counts plans with no status (`undeclaredStatusRatchet` is gone), each now its own finding.
- **Corpus.** Every check takes `except` (pathspecs) and `corpus: { atLeast }`, and prints the engine's pass line. `allowedNonPlans` is `except` — the folder's `README.md` is never a plan. `planStaleness` reads citations of the archive from `docs` (default `**/*.md`, it was fixed) and exempts with `except`; `mayCiteArchive` is gone, and both folders' `README.md` may always cite. `decisionLogShape.docs` takes a list. A plans folder holding no plan still passes — its floor is 0 unless `corpus` says otherwise — while an absent folder fails, as before.
- **New refusal, a fix:** `planStaleness` fails when there are archived plans to cite and its `docs` matched no document — the citation half examined nothing.
- **Findings.** Every finding carries `file`, and `line` where known — the unknown `--id`, the branch and status declarations, a citation of the archive. Every message says what to do and ends with a period.
