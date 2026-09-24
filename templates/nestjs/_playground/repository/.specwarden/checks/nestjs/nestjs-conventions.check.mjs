// The NestJS conventions, from the plugin: a module reaches the database only through a repository.
// `modulesDir` and `ormPackage` are the facts the plugin cannot know. `ratchet` tolerates the imports
// that already exist and only turns down; `rule` says the convention in this repository's words.
import { nestjs } from '@specwarden/plugin-nestjs';

const plugin = nestjs({
  modulesDir: 'src/modules',
  ormPackage: 'typeorm',
  ratchet: { id: 'nestjs-db-access', ceiling: 0 },
  rule: 'A module never imports the ORM directly; persistence goes through a repository.',
});

// Plural: one plugin yields several checks.
export const checks = plugin.checks;
