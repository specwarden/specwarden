---
'@specwarden/template-monorepo': patch
'@specwarden/template-nestjs': patch
---

The `.example` checks these templates write parse once renamed. `dependency-pins.check.mjs.example` (monorepo) and `migrations-backwards-compatible.check.mjs.example` (nestjs) contained an escaped backtick that is a syntax error in the generated file, so the day you switched one on, every run failed on import. If you scaffolded before this release and renamed either one, replace its body with what `specwarden init --template <name>` writes now.
