---
'@specwarden/scaffold-parts': minor
'@specwarden/template-monorepo': minor
'@specwarden/template-nestjs': minor
'@specwarden/template-ops': minor
'@specwarden/template-openspec': minor
'@specwarden/template-speckit': minor
---

The parts and templates write the ops, nestjs and spec-source modules' new names: `envPairing`, `proxyUpstreams`, `ciCoverage` (`workflowFile`, `requiredJob`), `buildOrder` (a RegExp `buildInvocation`), `shellScope` (`scripts`), `nestjs({ modulesDir })` without `ruleDocument`, and the commented `specsDir`/`changesDir`/`requirementPattern` and `featuresDir` options of the spec sources.

- The shell-scope part writes `checks/ops/shell-scope.check.mjs`, whose id is the module's own `shell-scope` (was `shell-local-scope`). The nestjs template's check is `nestjs-db-access`.
- The `env-files-agree` example ships `verifierService: 'your-verifier'`, marked REPLACE: an empty name is now refused when the file loads, and an example must construct the day it is renamed. Switched on as shipped, it fails naming the service no compose file declares.
