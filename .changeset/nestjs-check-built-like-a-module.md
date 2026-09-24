---
'@specwarden/plugin-nestjs': minor
---

The plugin's check is built like every module's. Its id is `nestjs-db-access` (was `nestjs/db-access-through-repositories` — the only id with a slash); it carries the rule the package implies, owned by `@specwarden/plugin-nestjs`, so it is no orphan in a repository that keeps a rule register; and it speaks in the `product` zone.

- `nestjs()` takes `IModuleCheckDeclaration` beside its own options: `id`, `tier`, `when`, `hint`, `advisory` reach the check — they were accepted and dropped — and `zone` is refused.
- `modulesRoot` → `modulesDir`; `allowedFrom` → `except` (pathspecs; `DEFAULT_ALLOWED_FROM` → `DEFAULT_NESTJS_EXCEPT`, the same four entries); `ruleDocument` is removed — write `rule: { statement, owner }`, and the hint names the owner. New `corpus`. `NESTJS_DB_ACCESS_ID` is exported.
