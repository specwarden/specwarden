// The NestJS conventions, from the plugin: a module reaches the database only through a repository.
// `modulesRoot` and `ormPackage` are the facts the plugin cannot know. `ratchet` tolerates the imports
// that already exist and only turns down; `ruleDocument` is where the convention is written.
import { nestjs } from '@specwarden/plugin-nestjs';

const plugin = nestjs({
  modulesRoot: 'src/modules',
  ormPackage: 'typeorm',
  ratchetId: 'nestjs-db-access',
  ratchet: 0,
  ruleDocument: 'docs/architecture.md',
  rule: 'A module never imports the ORM directly; persistence goes through a repository.',
});

// Plural: one plugin yields several checks.
export const checks = plugin.checks;
