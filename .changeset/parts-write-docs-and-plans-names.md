---
'@specwarden/scaffold-parts': minor
'@specwarden/template-agentic': minor
'@specwarden/template-docs-only': minor
'@specwarden/template-monorepo': minor
'@specwarden/template-node-ts': minor
'@specwarden/template-openspec': minor
'@specwarden/template-ops': minor
'@specwarden/template-speckit': minor
---

The documentation and plan checks a template writes use `@specwarden/docs` and `@specwarden/plans` by their new names. No verdict changes.

- `doc-paths.check.mjs` leaves a tree out with `except` (was `skipDirs`); `docPathsPart` takes `except`.
- `plan-shape.check.mjs` names `phaseHeading`, `sizing` and `command` as the options replacing the English defaults; the `doc-counts` example names `number` for the digit grammar.
