---
'@specwarden/template-nestjs': patch
---

A NestJS service scaffolded with this template is green on its first run again. The generated `nestjs-conventions` check allowed the ORM only under `repositories/`, but a TypeORM entity cannot be written without importing `typeorm` for its decorators — so every real service went red on `src/modules/<feature>/entities/*.entity.ts`. Entities and specs are now allowed alongside repositories; a service that builds a query itself is still refused.

If you scaffolded before this release, add `allowedFrom: ['**/repositories/**', '**/*.entity.ts', '**/*.spec.ts']` to `.specwarden/checks/backend/nestjs-conventions.check.mjs`.
