/**
 * What every primitive is built from.
 *
 * The declarative primitives express a structural rule without a class: each is a
 * FACTORY producing an `ICheck`, and each is itself tested as part of the product, so
 * a consumer writes a rule in one line and never writes a test for it. That is the
 * larger of the two wins — a hand-written check needs both a class and a test, and a
 * primitive supplies both.
 *
 * These helpers keep every primitive built the same way — same identity plumbing, same
 * verdict rule — so the primitive files differ only in the structural question they
 * ask. They are grouped by what they are ABOUT rather than kept in one utility module:
 * assembling a check, framing a verdict, reading an import, reading a path.
 */
export {
  UNNAMED_CHECK_ID,
  attributionOf,
  buildCheck,
  nameFromFile,
  normaliseRule,
} from './build-check/build-check.util';
export { frameTolerated, thresholdOf, verdictFrom } from './verdict/verdict.util';
export type { IThreshold } from './verdict/verdict.util';
export { belowCorpusFloor, examinedNote, withExaminedNote } from './corpus-floor/corpus-floor.util';
export { CheckOptionsError, checkOptions } from './check-options/check-options.util';
export type { ICheckOptionsMode, IOptionShape, TOptionKind, TOptionSpec } from './check-options/check-options.util';
export type { ICorpusFloor } from './corpus-floor/corpus-floor.util';
export { emptyCorpusReason, readAll, readTracked, trackedCorpus } from './corpus/corpus.util';
export type { IDocument, ITrackedCorpus, TPathspecs } from './corpus/corpus.util';
export { changedContaining, changedEnding, changedUnder, resolveWhen } from '../../domain';
export type { IWhenSpec, TWhen } from '../../domain';
export { IMPORT_RE, matchesSpecifier, testStateless } from './import-specifier/import-specifier.util';
export { dirOf, joinDir, lineOf, pathMatches, stem } from './source-path/source-path.util';
export { catalogNotes, resolveCatalog } from './catalog/catalog.util';
export type { ICatalogDisable, ICatalogEntry, ICatalogOptions, IResolvedCatalog } from './catalog/catalog.util';
