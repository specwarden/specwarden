---
'specwarden': minor
---

The engine's names follow `core/GLOSSARY.md`. Every rename is outright — nothing was released, so no old name is kept beside the new one.

- The config is `.specwarden/config.mjs` (or `.specwarden/config/config.mjs`). A leftover `warden.config.mjs` is a load error, exit 2, naming the rename — read as "no config" it made every command say there was nothing to run. `init` refuses to write a second config beside one.
- `IWardenConfig` → `ISpecwardenConfig`. The config keys `harness` → `selfChecks` and `concurrency` → `jobs`; a config still carrying either old key is refused, exit 2, naming the key to write — under the old name it applied nothing.
- The bin is `bin/specwarden.mjs`, still installed as `specwarden` and `spw`; the usage names the alias.
- `CheckRegistry` → `CheckRoster` (`ICheckRegistryOptions` → `ICheckRosterOptions`).
- The self-checks: `harnessChecks` → `selfChecks`, `HARNESS_CHECK_IDS` → `SELF_CHECK_IDS`, `IHarnessOptions` → `ISelfCheckOptions`, `IHarnessInputs` → `ISelfCheckInputs`; their rule is `self-checks-hold` (was `harness-integrity`), and their notes say `self-check '<id>' disabled`.
- The perimeter's entries are policies: `commandRule`/`writeRule` → `commandPolicy`/`writePolicy`, `ICommandRuleSpec`/`IWriteRuleSpec` → `ICommandPolicyOptions`/`IWritePolicyOptions`, `IPerimeterRule` → `IPerimeterPolicy`, `IPerimeterVerdict.ruleId` → `policyId`. `perimeter.mjs` exports `policies`; one still exporting `rules` is refused by `enforcement-resolves`, naming the rename (the hook still fails open on it). A block reads `— policy <id>`.
- A rule's `enforcement.checkIds` → `enforcement.enforcedBy`. The self-checks' `otherEnforcerIds` → `enforcers`; `orphanCheck`, `enforcementResolves` and `ISelfCheckInputs` take the roster's ids as `roster`.
- `IRunOutcome` → `IRunResult`, `ICommandCheckSpec` → `ICommandCheckOptions`, `IOptionRule` → `IOptionShape`, `RatchetOverwriteError.ratchetId` → `id`, the runner option `concurrency` → `jobs`.
- Removed: `SpecwardenZoneError` and `assertZoneMatchesLocation` (nothing called them), the `CommandCheck` class from the barrel (`commandCheck` stays), and the `gateCheck` export a check file could use — a file exporting only it now exports no check, which is a load error.
