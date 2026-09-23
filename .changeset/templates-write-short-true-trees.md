---
'@specwarden/template-agentic': minor
'@specwarden/template-docs-only': minor
'@specwarden/template-monorepo': minor
'@specwarden/template-nestjs': minor
'@specwarden/template-node-ts': minor
'@specwarden/template-openspec': minor
'@specwarden/template-ops': minor
'@specwarden/template-speckit': minor
---

Every template writes a tree about a third the length — each check a short header and its options, fewer comment lines than code in every file set — with each rule on the check that enforces it, and each example's rule commented out in `rules.mjs`. Needs this release's `specwarden`.

What a repository scaffolded with an earlier version may want to change by hand — nothing breaks if it does not:

- **docs-only, agentic, ops, monorepo** read every tracked document (`docs: '**/*.md'`): the root README, and agentic's `AGENTS.md` / `CLAUDE.md`, were outside the corpus, so a dead path in the first file a reader follows passed. Agentic skips the plan archive (`skipDirs: ['docs/_plans-archive/']`). Widening an existing tree's `docs` may turn it red over paths that were already dead.
- **docs-only, node-ts** — `doc-counts` and `doc-symbols` examples shipped `countableNouns: []` / `suffixes: []`, a load error now. Fill the list in before renaming the example.
- **nestjs** — the migration-guard example declares `corpus: { atLeast: 1 }`: over no migration it fails instead of passing with "0 migration file(s) read". The plugin call carries `rule`, and relies on the plugin's default `allowedFrom`, which includes entities.
- **ops, monorepo, nestjs** — the gate-coverage, upstream and env-file examples point at the workflow, proxy config and `.env.example` `init` found, instead of `.github/workflows/ci.yml`, `caddy/Caddyfile.${mode}` and `config/env.schema.json`.
- **agentic** — `warden.config.mjs` no longer imports `perimeter.mjs` for `harness.otherEnforcerIds`; the engine reads the perimeter's rule ids itself, and the old line still works.
