---
'@specwarden/scaffold-parts': minor
'@specwarden/template-agentic': minor
'@specwarden/template-docs-only': minor
'@specwarden/template-monorepo': minor
'@specwarden/template-nestjs': minor
'@specwarden/template-node-ts': minor
'@specwarden/template-openspec': minor
'@specwarden/template-ops': minor
'@specwarden/template-speckit': minor
'@specwarden/plugin-nestjs': minor
'@specwarden/ops': patch
---

What the templates write follows the engine's renames: `.specwarden/config.mjs`, rules naming their enforcers in `enforcement.enforcedBy`, and a `perimeter.mjs` exporting `policies` of `commandPolicy`.

- `@specwarden/plugin-nestjs`: `ratchetId` + `ratchet` → one `ratchet: n` or `ratchet: { id, ceiling }`, and the nestjs template writes `ratchet: { id: 'nestjs-db-access', ceiling: 0 }`.
- `@specwarden/ops`: **a fix** — `gatesHaveCiJobs`' default runner pattern finds `specwarden.mjs check`, the engine's renamed bin; it looked for `warden.mjs` and read a job running the new bin as a job running no check.
