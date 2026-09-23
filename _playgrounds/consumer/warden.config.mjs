/**
 * The config a consumer writes after installing every package this workspace publishes.
 *
 * One plugin, one spec source; every other package contributes a check file under
 * `checks/`, discovered by the engine. The harness's own audits are off, as they are in the
 * in-process spec beside this: they audit a rule register, and this tree is about the
 * PACKAGES composing — `false` says so rather than letting them fail for a reason that is
 * not the subject.
 */
import { openspec } from '@specwarden/openspec';
import { nestjs } from '@specwarden/plugin-nestjs';
import { defineConfig } from 'specwarden';

export default defineConfig({
  plugins: [nestjs({ modulesRoot: 'src/modules', ormPackage: 'drizzle-orm' })],
  specSource: openspec(),
  harness: false,
});
