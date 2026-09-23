---
'@specwarden/openspec': patch
'@specwarden/speckit': patch
---

The GUIDEs and skills now document an invariant marker that can match: `<!-- invariant: <full id> -->` with `idPattern: /<!--\s*invariant:\s*([^\s>]+)\s*-->/`, where the id is exactly what `sync-invariants` prints (`auth#the-system-shall-refuse-an-expired-token`, `001-invites#FR-001`). The pattern they showed captured a local `INV-…` number, which can never equal an adapter's id, so following them never reached "in sync". If you copied that pattern, switch to this one and write each marker with the printed id. The OpenSpec skill's config snippet also imports `defineConfig`, which it called without importing.
