import {
  type ICheck,
  type ICheckRule,
  type ICorpusFloor,
  type IModuleCheckDeclaration,
  type IPlugin,
  checkOptions,
  forbidImport,
} from 'specwarden';

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
 * THE CHECK IS A MODULE'S CHECK, like every other package's: it takes the declaration a
 * consumer writes on any module check (`id`, `tier`, `when`, `rule`, `ratchet`, …), carries
 * the rule the package implies, and speaks in the `product` zone. It took only `ratchet` and
 * `rule` — an `id`, a `tier` or a `when` handed to it was accepted and dropped, and its
 * findings were an orphan's until the consumer thought to write a rule.
 *
 * THE RATCHET IS THE CONSUMER'S, not the plugin's. A debt count belongs to the tree that
 * has the debt. A plugin shipping a number would be asserting something about a repository
 * it has never seen.
 */

export interface INestjsOptions extends IModuleCheckDeclaration {
  /** Where the modules live, repo-relative. */
  readonly modulesDir: string;
  /** The ORM (or any data-access package) a module may not import directly. */
  readonly ormPackage: string;
  /** Pathspecs that MAY import it, left out of the ban — the repository layer itself, the
   * entities that ARE the ORM's schema, and the tests that exercise them. Default:
   * `DEFAULT_NESTJS_EXCEPT`. */
  readonly except?: readonly string[];
  /** How many module files a run must scan. Default: at least 1. */
  readonly corpus?: ICorpusFloor;
}

/** The id the check carries unless the consumer names another. */
export const NESTJS_DB_ACCESS_ID = 'nestjs-db-access';

/**
 * What a module MAY reach the ORM from: the repository layer, the entities, and the tests.
 *
 * An entity is not a query written in the wrong place — it IS the ORM's schema, and a
 * TypeORM or Drizzle entity cannot be written without importing the ORM for its
 * decorators or table builders. Without the entity shapes here every real service was red
 * on `src/modules/<feature>/entities/*.entity.ts` on its first run.
 *
 * Pathspecs, like every `except`, rather than suffixes under the modules directory: the ban
 * reads only `<modulesDir>/**`, so `**\/repositories/**` already means the repositories
 * among the modules, and a consumer writes one spelling of "leave these out" everywhere.
 */
export const DEFAULT_NESTJS_EXCEPT: readonly string[] = [
  '**/repositories/**',
  '**/entities/**',
  '**/*.entity.ts',
  '**/*.spec.ts',
];

const RULE: ICheckRule = {
  statement: 'a module reaches the database only through a repository',
  owner: '@specwarden/plugin-nestjs',
  implied: true,
};

export function nestjs(options: INestjsOptions): IPlugin {
  checkOptions('nestjs', options, {
    modulesDir: { kind: 'string', required: true, nonEmpty: true },
    ormPackage: { kind: 'string', required: true, nonEmpty: true },
    except: { kind: 'array' },
    corpus: { kind: 'object' },
    zone: { refused: "a plugin's check speaks for its package, so its zone is `product`" },
  });
  const { modulesDir, ormPackage, except, ...declaration } = options;
  const rule = typeof options.rule === 'string' ? { statement: options.rule } : options.rule;

  const checks: ICheck[] = [
    forbidImport({
      ...declaration,
      id: options.id ?? NESTJS_DB_ACCESS_ID,
      rule: rule ?? RULE,
      zone: 'product',
      files: `${modulesDir}/**`,
      to: ormPackage,
      except: except ?? DEFAULT_NESTJS_EXCEPT,
      hint:
        options.hint ??
        `Move the query behind a repository, or add the file to \`except\`.${
          rule?.owner ? ` Rule: ${rule.owner}.` : ''
        }`,
    }),
  ];

  return { name: 'nestjs', checks };
}
