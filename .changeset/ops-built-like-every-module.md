---
'@specwarden/ops': minor
---

Verdict changes: every ops check now fails an empty corpus through the engine's corpus floor (`buildOrder` passed in silence when no container file ran a build), honours `ratchet` (all five accepted it and dropped it), and refuses `modes: []` and an empty `verifierService` when the file loads. Each is a check that was blind to the defect it is named for; a tree that goes red has it.

The factories are renamed for the subject each audits, and take the declaration every module check takes (`IModuleCheckDeclaration`). Nothing was released, so no old name is kept:

- `envFilesAgree` → `envPairing`, `upstreamsResolve` → `proxyUpstreams`, `gatesHaveCiJobs` → `ciCoverage`, `buildOrderFollowsDeps` → `buildOrder` (the helper that was `buildOrder` is `buildSequence`), `shellLocalScope` → `shellScope`; option types `IEnvPairingOptions`, `IProxyUpstreamsOptions`, `ICiCoverageOptions`, `IBuildOrderOptions`, `IShellScopeOptions`. `IOpsCheckIdentity` is removed.
- A check's id defaults to its factory's name in kebab case (`env-pairing`, `proxy-upstreams`, `ci-coverage`, `build-order`, `shell-scope`); `zone` is refused.
- New preset `opsChecks({ tier, when, envPairing, proxyUpstreams, ciCoverage, buildOrder, shellScope })`: builds every check unless told `false`, applies `tier` and `when` to each, and refuses a check whose facts are missing, naming them.
- `ciCoverage`: `workflow` → `workflowFile`, `arbiterJob` → `requiredJob` (the job branch protection requires), `gates` → `checks`, `IGateEntry` → `ICheckEntry`; `runnerPattern` and `DEFAULT_RUNNER_PATTERN` are RegExps, read statelessly; `ciTier`/`cheapTier` are `TTier`. `IWorkflowJob.gateIds`/`runsGates` → `checkIds`/`runsChecks`, and it carries the job's `line`. A matrix list may use `check:` as well as `gate:`.
- `buildOrder`: `buildInvocation` is a RegExp.
- `shellScope`: `pathspecs` → `scripts` (a pathspec or a list), and `except` pathspecs.
- Every check takes `corpus: { atLeast }`. A clean pass prints the engine's line (`✓ shell-scope — 3 shell file(s) examined, clean`); `env-pairing`'s corpus is the compose file's services, and a run that compared no mode is still `cannot-tell`.
- Findings carry `file` and `line` where known, and every message says what to do, ending with a period. `envPairing` reports its failures before its notes.
