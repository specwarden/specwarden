---
'specwarden': minor
'@specwarden/docs': patch
'@specwarden/plans': patch
'@specwarden/security': patch
---

**Behaviour change, a fix:** every finding a factory's check returns is attributed to the rule the check enforces — `rule.id`, else the check's id — stamped once by `buildCheck` over whatever the body wrote. A check whose rule has its own id attributed its findings to the check; a module check named by its file attributed them to `undefined` until the runner filled it in, so `runCheck` in a test saw none. The runner applies the same attribution to a check built any other way.

- `defineCheck` and `fromResult` no longer take `ruleId`: the attribution is the rule the check names (`rule: { id, statement }`), never a second id beside it. It is refused at load by name.
- `attributionOf(check)` is exported for a body that needs the id its findings carry.
- `docPaths`, `docSymbols`, `decisionLogShape` and `secretScan` read their threshold through `thresholdOf`, so a declared `direction` is honoured.
