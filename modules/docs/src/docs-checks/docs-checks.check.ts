import type { ICheck } from 'specwarden';
import { checkOptions } from 'specwarden';

import { optionsError } from '../_shared/identity/identity.model';
import { DEFAULT_DOCS } from '../_shared/nothing-examined/nothing-examined.util';
import { type IDocCountsOptions, docCounts } from '../doc-counts/doc-counts.check';
import { type IDocHygieneOptions, docHygiene } from '../doc-hygiene/doc-hygiene.check';
import { type IDocPathsOptions, docPaths } from '../doc-paths/doc-paths.check';
import { type IDocPlacementOptions, docPlacement } from '../doc-placement/doc-placement.check';
import { type IDocSymbolsOptions, docSymbols } from '../doc-symbols/doc-symbols.check';

/** One check's own options laid over what the preset gives it, or `false` to leave it out. */
export type TDocsOverride<T> = false | Partial<T>;

export interface IDocsChecksOptions {
  /** The documentation corpus every check reads. Default: `**\/*.md`. */
  readonly docs?: string;
  /** Directory prefixes `doc-paths`, `doc-symbols` and `doc-counts` do not read — an archive, a
   * snapshot, a generated tree. */
  readonly skipDirs?: readonly string[];
  /** Where the declarations live, for `doc-symbols`. */
  readonly code?: readonly string[];
  /** The endings that make a word a symbol, for `doc-symbols`. */
  readonly suffixes?: readonly string[];
  /** The nouns whose count the repository owns, for `doc-counts`. */
  readonly countableNouns?: readonly string[];
  /** `doc-paths`, over the preset's. */
  readonly paths?: TDocsOverride<IDocPathsOptions>;
  /** `doc-symbols`, over the preset's. */
  readonly symbols?: TDocsOverride<IDocSymbolsOptions>;
  /** `doc-counts`, over the preset's. */
  readonly counts?: TDocsOverride<IDocCountsOptions>;
  /** `doc-placement` — its contract, `allowed`, is the one thing no preset can know. */
  readonly placement?: TDocsOverride<IDocPlacementOptions>;
  /** `doc-hygiene`, over the preset's. */
  readonly hygiene?: TDocsOverride<IDocHygieneOptions>;
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The whole module in one call: the five checks, with their conventional ids, over one
 * corpus.
 *
 * WHY A PRESET. Wired one factory at a time the module was 31 lines, saying `docs` four
 * times and `tier` five — and the check that took no `docs` read a different corpus from
 * the other four without anybody deciding it should. Here the corpus is said once, and
 * each check still takes its own options, laid over the preset's, or `false` to leave it
 * out.
 *
 * WHAT IT CANNOT DEFAULT, and so asks for: the suffixes that make a word a symbol, the
 * nouns whose count the repository owns, and where a document may live. Each is a fact
 * about one repository. A check whose fact is missing is refused by name rather than left
 * out quietly — a preset that returned four checks when five were expected would be a
 * roster somebody believes is complete.
 */
export function docsChecks(options: IDocsChecksOptions = {}): ICheck[] {
  checkOptions('docsChecks', options, {
    docs: { kind: 'string' },
    skipDirs: { kind: 'array' },
    code: { kind: 'array' },
    suffixes: { kind: 'array' },
    countableNouns: { kind: 'array' },
    paths: { kind: ['object', 'boolean'] },
    symbols: { kind: ['object', 'boolean'] },
    counts: { kind: ['object', 'boolean'] },
    placement: { kind: ['object', 'boolean'] },
    hygiene: { kind: ['object', 'boolean'] },
  });
  const docs = options.docs ?? DEFAULT_DOCS;
  const skipDirs = options.skipDirs ?? [];
  const checks: ICheck[] = [];

  const asked = (key: keyof IDocsChecksOptions, id: string, what: string): never => {
    throw optionsError('docsChecks', undefined, `${what} for \`${id}\`, or \`${key}: false\` to leave it out.`);
  };

  if (options.paths !== false) {
    checks.push(
      docPaths({
        id: 'doc-paths',
        title: 'every repository path the documentation names resolves',
        tier: 'fast',
        docs,
        skipDirs,
        ...options.paths,
      }),
    );
  }

  if (options.symbols !== false) {
    const code = options.symbols?.code ?? options.code ?? asked('symbols', 'doc-symbols', 'pass `code`');
    const suffixes =
      options.symbols?.suffixes ?? options.suffixes ?? asked('symbols', 'doc-symbols', 'pass `suffixes`');
    checks.push(
      docSymbols({
        id: 'doc-symbols',
        title: 'every symbol the documentation names is declared',
        tier: 'fast',
        docs,
        skipDirs,
        ...options.symbols,
        code,
        suffixes,
      }),
    );
  }

  if (options.counts !== false) {
    const countableNouns =
      options.counts?.countableNouns ??
      options.countableNouns ??
      asked('counts', 'doc-counts', 'pass `countableNouns`');
    checks.push(
      docCounts({
        id: 'doc-counts',
        title: 'a count the repository owns is derived, never restated',
        tier: 'fast',
        docs,
        skipped: skipDirs.map((dir) => new RegExp(`^${escape(dir)}`)),
        ...options.counts,
        countableNouns,
      }),
    );
  }

  if (options.placement !== false) {
    const allowed =
      options.placement?.allowed ?? asked('placement', 'doc-placement', 'pass `placement: { allowed: [...] }`');
    checks.push(
      docPlacement({
        id: 'doc-placement',
        title: 'every document sits where the placement contract says its kind lives',
        tier: 'fast',
        docs,
        ...options.placement,
        allowed,
      }),
    );
  }

  if (options.hygiene !== false) {
    checks.push(
      docHygiene({
        id: 'doc-hygiene',
        title: 'every relative link in the documentation lands',
        tier: 'fast',
        docs,
        ...options.hygiene,
      }),
    );
  }

  return checks;
}
