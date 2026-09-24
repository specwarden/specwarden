import type { ICheck, ICorpusFloor, TPathspecs, TTier, TWhen } from 'specwarden';
import { CheckOptionsError, checkOptions } from 'specwarden';

import { DEFAULT_DOCS } from '../_shared/corpus/corpus.util';
import { type IDocCountsOptions, docCounts } from '../doc-counts/doc-counts.check';
import { type IDocHygieneOptions, docHygiene } from '../doc-hygiene/doc-hygiene.check';
import { type IDocPathsOptions, docPaths } from '../doc-paths/doc-paths.check';
import { type IDocPlacementOptions, docPlacement } from '../doc-placement/doc-placement.check';
import { type IDocSymbolsOptions, docSymbols } from '../doc-symbols/doc-symbols.check';

/** One check's own options laid over what the preset gives it, or `false` to leave it out. */
export type TDocsOverride<T> = false | Partial<T>;

export interface IDocsChecksOptions {
  /** The documentation corpus every check reads. Default: `**\/*.md`. */
  readonly docs?: TPathspecs;
  /** Pathspecs every check leaves out of its corpus — an archive, a snapshot, a generated tree. */
  readonly except?: readonly string[];
  /** The corpus floor every check holds. Default: one document. */
  readonly corpus?: ICorpusFloor;
  /** The tier every check runs in. Default: `fast`. */
  readonly tier?: TTier;
  /** When every check matters. Default: always. */
  readonly when?: TWhen;
  /** Where the declarations live, for `doc-symbols`. */
  readonly code?: TPathspecs;
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

/** Why a preset refuses the identity a single check takes — it builds five. */
const ONE_CHECK_ONLY = (option: string): { refused: string } => ({
  refused: `a preset builds five checks, and ${option} belongs to one of them — give it in that check's own options, e.g. \`paths: { ${option}: … }\``,
});

/**
 * The whole module in one call: the five checks, each with its own id and title, over one
 * corpus.
 *
 * WHY A PRESET. Wired one factory at a time the module was 31 lines, saying `docs` four
 * times and `tier` five — and the check that took no `docs` read a different corpus from
 * the other four without anybody deciding it should. Here the corpus, its exemptions, the
 * tier and the relevance are said once and reach every check; each check still takes its
 * own options, laid over the preset's, or `false` to leave it out.
 *
 * `tier` and `when` were accepted here and dropped: every check was built in `fast` and ran
 * on every change, whatever the preset was told. The identity a SINGLE check takes — an id,
 * a title, a rule, a ratchet — is refused by name: five checks cannot share one.
 *
 * WHAT IT CANNOT DEFAULT, and so asks for: the suffixes that make a word a symbol, the
 * nouns whose count the repository owns, and where a document may live. Each is a fact
 * about one repository. A check whose fact is missing is refused by name rather than left
 * out quietly — a preset that returned four checks when five were expected would be a
 * roster somebody believes is complete.
 */
export function docsChecks(options: IDocsChecksOptions = {}): ICheck[] {
  checkOptions(
    'docsChecks',
    options,
    {
      docs: { kind: ['string', 'array'], nonEmpty: true },
      except: { kind: 'array' },
      corpus: { kind: 'object' },
      tier: { kind: 'string' },
      when: { kind: ['function', 'object'] },
      code: { kind: ['string', 'array'], nonEmpty: true },
      suffixes: { kind: 'array', nonEmpty: true },
      countableNouns: { kind: 'array', nonEmpty: true },
      paths: { kind: ['object', 'boolean'] },
      symbols: { kind: ['object', 'boolean'] },
      counts: { kind: ['object', 'boolean'] },
      placement: { kind: ['object', 'boolean'] },
      hygiene: { kind: ['object', 'boolean'] },
      id: ONE_CHECK_ONLY('id'),
      title: ONE_CHECK_ONLY('title'),
      rule: ONE_CHECK_ONLY('rule'),
      ratchet: ONE_CHECK_ONLY('ratchet'),
    },
    { identity: false },
  );
  // What every check shares, each key only when it was given, so a check's own default
  // is never overwritten by an `undefined`.
  const shared = {
    docs: options.docs ?? DEFAULT_DOCS,
    ...(options.except === undefined ? {} : { except: options.except }),
    ...(options.corpus === undefined ? {} : { corpus: options.corpus }),
    ...(options.tier === undefined ? {} : { tier: options.tier }),
    ...(options.when === undefined ? {} : { when: options.when }),
  };
  const checks: ICheck[] = [];

  const asked = (key: keyof IDocsChecksOptions, id: string, what: string): never => {
    throw new CheckOptionsError(`docsChecks: ${what} for \`${id}\`, or \`${key}: false\` to leave it out.`);
  };

  if (options.paths !== false) checks.push(docPaths({ ...shared, ...options.paths }));

  if (options.symbols !== false) {
    const code = options.symbols?.code ?? options.code ?? asked('symbols', 'doc-symbols', 'pass `code`');
    const suffixes =
      options.symbols?.suffixes ?? options.suffixes ?? asked('symbols', 'doc-symbols', 'pass `suffixes`');
    checks.push(docSymbols({ ...shared, ...options.symbols, code, suffixes }));
  }

  if (options.counts !== false) {
    const countableNouns =
      options.counts?.countableNouns ??
      options.countableNouns ??
      asked('counts', 'doc-counts', 'pass `countableNouns`');
    checks.push(docCounts({ ...shared, ...options.counts, countableNouns }));
  }

  if (options.placement !== false) {
    const allowed =
      options.placement?.allowed ?? asked('placement', 'doc-placement', 'pass `placement: { allowed: [...] }`');
    checks.push(docPlacement({ ...shared, ...options.placement, allowed }));
  }

  if (options.hygiene !== false) checks.push(docHygiene({ ...shared, ...options.hygiene }));

  return checks;
}
