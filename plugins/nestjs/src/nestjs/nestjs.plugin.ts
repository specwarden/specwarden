import { type ICheck, type ICheckIdentity, type IPlugin, checkOptions, forbidImport } from 'specwarden';

/**
 * NestJS conventions as a specwarden plugin.
 *
 * WHY A PACKAGE RATHER THAN A CHECK IN ONE REPOSITORY'S CONFIG. The rule below is not a
 * fact about any particular project — it is a fact about the architecture NestJS pushes
 * toward: a module reaches the database through a repository, so the query lives in one
 * layer and the module can be tested without one. Every NestJS codebase that draws that
 * line wants the same check, and the only thing that differs between them is where their
 * modules sit and what their ORM is called.
 *
 * WHAT A PLUGIN MAY DO, and what it may not. It DECLARES checks. It never supplies a port
 * adapter — the loader refuses one — because a plugin that could reach the filesystem
 * itself would be a way around the capability gating that makes a check safe to install at
 * all. Everything here is built from the engine's declarative primitives, so the plugin
 * carries no I/O of its own.
 *
 * THE RATCHET IS THE CONSUMER'S, not the plugin's. A debt count belongs to the tree that
 * has the debt; the plugin takes an id and the host owns the file behind it. A plugin
 * shipping a number would be asserting something about a repository it has never seen.
 */

export interface INestjsOptions {
  /** Where the modules live, repo-relative. */
  readonly modulesRoot: string;
  /** The ORM (or any data-access package) a module may not import directly. */
  readonly ormPackage: string;
  /** Glob suffixes under `modulesRoot` that MAY import it — the repository layer itself,
   * the entities that ARE the ORM's schema, and the tests that exercise them. Default:
   * `DEFAULT_ALLOWED_FROM`. */
  readonly allowedFrom?: readonly string[];
  /** The consumer's ratchet id and its inline fallback, for a tree that has existing
   * violations. Omit both in a clean tree. */
  readonly ratchetId?: string;
  readonly ratchet?: number;
  /** Where the host writes the rule down, named in the finding so a reader can go there. */
  readonly ruleDocument?: string;
  /** The rule the check enforces, so it joins the host's rule register rather than being
   * an orphan the register's audit reports. A statement, or `{ statement, owner }`. */
  readonly rule?: ICheckIdentity['rule'];
}

/**
 * Where a module MAY reach the ORM: the repository layer, the entities, and the tests.
 *
 * An entity is not a query written in the wrong place — it IS the ORM's schema, and a
 * TypeORM or Drizzle entity cannot be written without importing the ORM for its
 * decorators or table builders. Without the entity shapes here every real service was red
 * on `src/modules/<feature>/entities/*.entity.ts` on its first run.
 */
export const DEFAULT_ALLOWED_FROM: readonly string[] = [
  '**/repositories/**',
  '**/entities/**',
  '**/*.entity.ts',
  '**/*.spec.ts',
];

export function nestjs(options: INestjsOptions): IPlugin {
  checkOptions('nestjs', options, {
    modulesRoot: { kind: 'string', required: true },
    ormPackage: { kind: 'string', required: true },
    allowedFrom: { kind: 'array' },
    ruleDocument: { kind: 'string' },
  });
  const allowed = options.allowedFrom ?? DEFAULT_ALLOWED_FROM;

  const checks: ICheck[] = [
    forbidImport({
      id: 'nestjs/db-access-through-repositories',
      title: 'a module reaches the database only through a repository',
      tier: 'fast',
      from: `${options.modulesRoot}/**`,
      to: options.ormPackage,
      except: allowed.map((suffix) => `${options.modulesRoot}/${suffix}`),
      ratchetId: options.ratchetId,
      ratchet: options.ratchet,
      rule: options.rule,
      hint:
        `Move the query behind a repository, or add the file to the excepted set.` +
        (options.ruleDocument ? ` Rule: ${options.ruleDocument}.` : ''),
    }),
  ];

  return { name: 'nestjs', checks };
}
