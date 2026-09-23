/**
 * The NestJS conventions, from the plugin.
 *
 * A plugin declares WHAT to check; the engine owns the ports. This file supplies the
 * two facts the plugin cannot know — where the modules are, and which package is the
 * ORM — and exports the checks it produced. Exported as `checks` (plural) because one
 * plugin yields several.
 *
 * `ratchet` is the count of violations that already exist and are tolerated. Set it to
 * what `--tighten` measures; it only turns DOWN, so it holds today and fails on the
 * next one. Point `ruleDocument` at where the convention is written down — a rule
 * whose rationale lives nowhere is a rule nobody can argue with.
 */
import { nestjs } from '@specwarden/plugin-nestjs';

const plugin = nestjs({
  modulesRoot: 'src/modules',
  ormPackage: 'typeorm',
  // Where the ORM IS the point: the repository that queries, the entity whose decorators
  // map the table, and a spec. An entity cannot be written without importing `typeorm`,
  // so leaving it out made the first run red on every TypeORM service there is.
  allowedFrom: ['**/repositories/**', '**/*.entity.ts', '**/*.spec.ts'],
  ratchetId: 'nestjs-db-access',
  ratchet: 0,
  ruleDocument: 'docs/architecture.md',
});

export const checks = plugin.checks;
