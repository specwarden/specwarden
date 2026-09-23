import type { IRule, ITemplate, ITemplateContext, ITemplateFile } from 'specwarden';
import {
  compose,
  envFilesExamplePart,
  exampleRule,
  header,
  scriptWrappersPart,
  secretScanPart,
  switchOn,
  tierOption,
} from '@specwarden/scaffold-parts';

/**
 * A starting tree for a NestJS backend.
 *
 * The plugin carries the conventions — a module reaches the database only through a
 * repository, and the rest of that stack's rules — so this template's job is to WIRE
 * it with the two facts no engine can guess: where the modules live, and which package
 * is the ORM. Both arrive as a generated config the repository then owns.
 *
 * Beside it: a credential scan (a backend is where connection strings live), the lint
 * and test scripts the repository already declares, an env-file check where a compose
 * file was found, and a migration guard as an `.example` — because whether migrations
 * must be backwards-compatible depends on whether the deploy runs them before or after
 * the container swap, a fact about a pipeline rather than about NestJS.
 */
const shared = (ctx: ITemplateContext) =>
  compose(
    secretScanPart(ctx, {
      header:
        'A backend is where connection strings, signing keys and provider tokens live.\nA match means rotate first, delete second.',
    }),
    scriptWrappersPart(ctx),
    envFilesExamplePart(ctx),
  );

export const nestjsTemplate: ITemplate = {
  name: 'nestjs',
  describe: 'a NestJS backend — module conventions via the plugin, credential scan, env files, migration guard',
  // The ops module ONLY where a compose file made the env-file check worth writing.
  // Demanding it of every NestJS repository would be an install to satisfy a check that
  // repository does not have.
  requires: (ctx: ITemplateContext): readonly string[] => [
    '@specwarden/plugin-nestjs',
    '@specwarden/security',
    ...(ctx.composeFiles.length > 0 ? ['@specwarden/ops'] : []),
  ],

  files: (ctx: ITemplateContext): readonly ITemplateFile[] => [
    {
      path: 'checks/backend/nestjs-conventions.check.mjs',
      body: `${header(
        'The NestJS conventions, from the plugin: a module reaches the database only through a repository.',
        '`modulesRoot` and `ormPackage` are the facts the plugin cannot know. `ratchet` tolerates the imports\nthat already exist and only turns down; `ruleDocument` is where the convention is written.',
      )}
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
`,
    },
    {
      path: 'checks/backend/migrations-backwards-compatible.check.mjs.example',
      body: `${header(
        '`migrations-backwards-compatible` — no migration breaks the code still running during the deploy.',
        `OFF because it is right only where the deploy runs migrations BEFORE the container swap; if
yours swaps first, delete this file. The old code cannot survive the three statements below.
${switchOn('migrations-backwards-compatible')}`,
      )}
import { fromResult } from 'specwarden';

const UNSAFE = [
  { pattern: /\\bDROP\\s+COLUMN\\b/i, why: 'the old code still selects it — drop it in a later deploy' },
  { pattern: /\\bRENAME\\s+COLUMN\\b/i, why: 'add the new column, backfill, then remove the old one' },
  { pattern: /\\bSET\\s+NOT\\s+NULL\\b/i, why: 'the old code still writes NULL — tighten after it is gone' },
];

export const check = fromResult({
  id: 'migrations-backwards-compatible',
${tierOption(ctx)}  corpus: { atLeast: 1, why: 'no .sql file under migrations/ — point the pathspec at where they are' },
  hint: 'Use expand-contract across two deploys. The rule is in docs/architecture.md.',
  run: (ctx) => {
    const files = ctx.vcs.trackedFiles('migrations/**/*.sql');
    const failures = [];
    for (const file of files) {
      const sql = ctx.files.tryRead(file) ?? '';
      for (const { pattern, why } of UNSAFE) {
        if (pattern.test(sql)) failures.push({ file, message: \`\${pattern.source} — \${why}\` });
      }
    }
    return { failures, examined: files.length, unit: 'migration files' };
  },
});
`,
    },
    ...shared(ctx).files,
  ],

  rules: (ctx: ITemplateContext): readonly IRule[] => [
    exampleRule(
      'migrations-backwards-compatible',
      'A migration never breaks the code still running during the deploy.',
    ),
    ...shared(ctx).rules,
  ],
};
