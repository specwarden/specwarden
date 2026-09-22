import type { IRule, ITemplate, ITemplateContext, ITemplateFile } from 'specwarden';
import { compose, envFilesExamplePart, scriptWrappersPart, secretScanPart } from 'specwarden-scaffold-parts';

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
      header: `a credential-shaped string anywhere in the tracked tree.
 *
 * A backend is where connection strings, signing keys and provider tokens live, so this
 * is the one check worth having before any other. The built-in vendor library is a
 * PRESET: add your own formats with \`patterns.extra\`, and switch one off with
 * \`patterns.disable\` — which requires a reason, and reports it.`,
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
    'specwarden-plugin-nestjs',
    'specwarden-module-security',
    ...(ctx.composeFiles.length > 0 ? ['specwarden-module-ops'] : []),
  ],

  files: (ctx: ITemplateContext): readonly ITemplateFile[] => [
    {
      path: 'checks/backend/nestjs-conventions.check.mjs',
      body: `/**
 * The NestJS conventions, from the plugin.
 *
 * A plugin declares WHAT to check; the engine owns the ports. This file supplies the
 * two facts the plugin cannot know — where the modules are, and which package is the
 * ORM — and exports the checks it produced. Exported as \`checks\` (plural) because one
 * plugin yields several.
 *
 * \`ratchet\` is the count of violations that already exist and are tolerated. Set it to
 * what \`--tighten\` measures; it only turns DOWN, so it holds today and fails on the
 * next one. Point \`ruleDocument\` at where the convention is written down — a rule
 * whose rationale lives nowhere is a rule nobody can argue with.
 */
import { nestjs } from 'specwarden-plugin-nestjs';

const plugin = nestjs({
  modulesRoot: 'src/modules',
  ormPackage: 'typeorm',
  ratchetId: 'nestjs-db-access',
  ratchet: 0,
  ruleDocument: 'docs/architecture.md',
});

export const checks = plugin.checks;
`,
    },
    {
      path: 'checks/backend/migrations-backwards-compatible.check.mjs.example',
      body: `/**
 * \`migrations-backwards-compatible\` — a migration the OLD code can survive.
 *
 * Ships as \`.example\` because it depends on a fact about your PIPELINE, not about
 * NestJS: if the deploy runs migrations BEFORE the container swap, then for a moment
 * the old code meets the new schema, and \`DROP COLUMN\`, \`RENAME COLUMN\` and a
 * tightened \`NOT NULL\` all break it. If your deploy swaps first, this check is wrong
 * for you — delete it rather than adapting it.
 *
 * Rename to \`.check.mjs\` when the first is true. The expand-contract alternative it
 * pushes you toward is two deploys, and that is the point.
 */
import { fromResult } from 'specwarden';

/** The three statements the old code cannot survive, each with what to do instead. */
const UNSAFE = [
  { pattern: /\\bDROP\\s+COLUMN\\b/i, why: 'the old code still selects it — drop it in a later deploy' },
  { pattern: /\\bRENAME\\s+COLUMN\\b/i, why: 'add the new column, backfill, then remove the old one' },
  { pattern: /\\bSET\\s+NOT\\s+NULL\\b/i, why: 'the old code still writes NULL — tighten after it is gone' },
];

export const check = fromResult({
  id: 'migrations-backwards-compatible',
  title: 'no migration breaks the code still running during the deploy',
  tier: '${ctx.tier}',
  when: (changed) => changed.some((f) => f.startsWith('migrations/')),
  hint: 'Use expand-contract across two deploys. The rule is in docs/architecture.md.',
  run: (ctx) => {
    const files = ctx.vcs.trackedFiles('migrations/**/*.sql');
    const failures = [];
    for (const file of files) {
      const sql = ctx.files.tryRead(file) ?? '';
      for (const { pattern, why } of UNSAFE) {
        if (pattern.test(sql)) failures.push({ file, message: \\\`\\\${pattern.source} — \\\${why}\\\` });
      }
    }
    // An empty corpus is reported, never passed over: a glob matching nothing is the
    // commonest way a check stops checking without anybody noticing.
    return { failures, notes: [\\\`\\\${files.length} migration file(s) read\\\`] };
  },
});
`,
    },
    ...shared(ctx).files,
  ],

  rules: (ctx: ITemplateContext): readonly IRule[] => [
    {
      id: 'a-module-reaches-the-database-through-a-repository',
      statement: 'A module never imports the ORM directly; persistence goes through a repository.',
      owner: '',
      enforcement: { checkIds: ['nestjs/db-access-through-repositories'] },
    },
    ...shared(ctx).rules,
  ],
};
