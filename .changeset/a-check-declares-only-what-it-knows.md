---
'specwarden': minor
---

A check carries only what it knows; the engine supplies the rest.

- `tier` defaults to `fast` in every factory, `commandCheck` included — a check with no tier was in no schedule at all.
- `title` defaults to the rule's statement, else the id — it listed as `undefined`.
- `rule` accepts a string, the statement: `rule: 'no TODO in shipped source'`. A rule with no `owner` on a discovered check is owned by the file that declares it.
- A check exported alone from `<name>.check.mjs` with no `id` is named `<name>`. A file exporting several checks must name each, and a check built anywhere else with no id is refused at registration, by name.
- `ratchetId` defaults to the check id when `ratchet` is set. **Behaviour change:** such a check now reads `.specwarden/ratchets/<id>.json` when it exists, `--tighten` writes it, and `ratchet-direction` holds it to the declared ceiling — `--tighten` recorded nothing for it before.

The one-line check is `export const check = forbidPattern({ in: 'src/**/*.ts', pattern: /TODO/, rule: 'no TODO in shipped source' });`. New: the `ICheckDeclaration` type (the identity with `id`, `title` and `tier` optional); `ICheckRule.owner` is optional; `CheckRegistry` takes `{ tiers, originOf }` and throws `UnknownTierError` and `UnnamedCheckError`, both exported.
