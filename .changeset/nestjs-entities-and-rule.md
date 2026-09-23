---
'@specwarden/plugin-nestjs': minor
---

The default `allowedFrom` now includes the entities — `**/entities/**` and `**/*.entity.ts` — beside `**/repositories/**` and `**/*.spec.ts`, exported as `DEFAULT_ALLOWED_FROM`. An entity IS the ORM's schema and cannot be written without importing it, so every real service was red on its entity file on the first run; a service that builds a query itself is still refused. `nestjs()` now takes `rule`, so its check is not an orphan in a repository that keeps a rule register. The GUIDE arms a ratchet inline at today's count (`ratchet: N`); `--tighten` no longer records a count the check failed at.
