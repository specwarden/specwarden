---
'@specwarden/scaffold-parts': minor
'@specwarden/template-agentic': minor
'@specwarden/template-docs-only': minor
'@specwarden/template-monorepo': minor
'@specwarden/template-nestjs': minor
'@specwarden/template-node-ts': minor
'@specwarden/template-openspec': minor
'@specwarden/template-ops': minor
'@specwarden/template-speckit': patch
'specwarden': minor
---

Every generated check lives under its module's family folder, and every generated id is
the module's own default — the two the templates diverged from before this release:

- **nestjs**: `checks/backend/nestjs-conventions.check.mjs` → `checks/nestjs/nestjs-conventions.check.mjs`;
  `checks/backend/migrations-backwards-compatible.check.mjs.example` → `checks/workspace/migrations-backwards-compatible.check.mjs.example`.
- **ops, monorepo**: `checks/harness/gate-coverage.check.mjs.example`, id `gate-coverage` →
  `checks/ops/ci-coverage.check.mjs.example`, id `ci-coverage`.
- **ops, nestjs**: `checks/ops/env-files-agree.check.mjs.example`, id `env-files-agree` →
  `checks/ops/env-pairing.check.mjs.example`, id `env-pairing`.
- **ops**: `checks/ops/upstreams-resolve.check.mjs.example`, id `upstreams-resolve` →
  `checks/ops/proxy-upstreams.check.mjs.example`, id `proxy-upstreams`.

A repository scaffolded with an earlier version that already switched one of these
examples on: rename the file and the rule's `id` in `rules.mjs` to match, or leave it —
nothing currently green turns red on its own.

`@specwarden/scaffold-parts` renames the parts that write them, so a part's name is what
it writes: `ciCoveragePart` → `ciCoverageExamplePart`, `envFilesExamplePart` →
`envPairingExamplePart`, `upstreamsExamplePart` → `proxyUpstreamsExamplePart`,
`agentRolesPart`/`IAgentRolesOptions` → `agentDefinitionsPart`/`IAgentDefinitionsOptions`.
Every template's exported object is now `<name>Template` (`nodeTs` → `nodeTsTemplate`,
`docsOnly` → `docsOnlyTemplate`, `monorepo` → `monorepoTemplate`, `agentic` →
`agenticTemplate`, `ops` → `opsTemplate`; `nestjsTemplate`, `openspecTemplate` and
`speckitTemplate` already used it).

`@specwarden/template-openspec` now wraps the linter and test suite the manifest already
declares, the same as its Spec Kit twin — a repository specified with OpenSpec is
otherwise an ordinary codebase, and the two disagreeing here was an oversight, not a
decision.

`specwarden`: `init --template`, given no name, lists every template this repository has
installed with the one line each describes itself by, and writes nothing — it used to be
refused as "needs a value", the same as a typo'd flag.
