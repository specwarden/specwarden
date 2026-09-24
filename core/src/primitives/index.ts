/** The eight declarative primitives — a structural rule as one line, each already
 * tested as part of the product so a consumer never tests its own rules. */
export { siblingRequired } from './sibling-required/sibling-required.primitive';
export type { ISiblingRequiredOptions } from './sibling-required/sibling-required.primitive';
export { fromResult } from './from-result/from-result.primitive';
export type { IFromResultOptions, IPlainResult, TProblem } from './from-result/from-result.primitive';
export { defineCheck } from './define-check/define-check.primitive';
export type { ICheckOutcome, IDefineCheckOptions, TCheckOutcome } from './define-check/define-check.primitive';
export { forbidImport } from './forbid-import/forbid-import.primitive';
export type { IForbidImportOptions } from './forbid-import/forbid-import.primitive';
export { forbidPattern } from './forbid-pattern/forbid-pattern.primitive';
export type { IForbidPatternOptions } from './forbid-pattern/forbid-pattern.primitive';
export { mustDeclare } from './must-declare/must-declare.primitive';
export type { IMustDeclareField, IMustDeclareOptions } from './must-declare/must-declare.primitive';
export { pathContract } from './path-contract/path-contract.primitive';
export type { IPathContractOptions } from './path-contract/path-contract.primitive';
export { referencesResolve } from './references-resolve/references-resolve.primitive';
export type { IReferencesResolveOptions } from './references-resolve/references-resolve.primitive';
export { regenerable } from './regenerable/regenerable.primitive';
export type { IRegenerableOptions } from './regenerable/regenerable.primitive';
export { sourcesAgree } from './sources-agree/sources-agree.primitive';
export type { INamedSource, ISourcesAgreeOptions } from './sources-agree/sources-agree.primitive';

/**
 * What a check is BUILT from, published because a check no longer has to live in
 * this package. A module or a consumer writing its own needs the same assembly and
 * the same verdict rule the built-ins use — without these it would reimplement both,
 * and two verdict rules is how a ratchet starts meaning different things in different
 * checks.
 */
export {
  attributionOf,
  buildCheck,
  checkOptions,
  CheckOptionsError,
  belowCorpusFloor,
  withExaminedNote,
  frameTolerated,
  thresholdOf,
  verdictFrom,
  resolveCatalog,
  catalogNotes,
  IMPORT_RE,
  matchesSpecifier,
  testStateless,
  dirOf,
  joinDir,
  lineOf,
  pathMatches,
  stem,
} from './_shared';
export type {
  ICatalogDisable,
  ICatalogEntry,
  ICatalogOptions,
  ICheckOptionsMode,
  ICorpusFloor,
  IOptionShape,
  IResolvedCatalog,
  IThreshold,
  TPathspecs,
  TOptionKind,
  TOptionSpec,
} from './_shared';

/**
 * Reading a corpus, and saying when a check matters.
 *
 * Both were mechanics every consumer wrote for itself, and both had already gone
 * wrong that way: the read idiom appeared verbatim in eleven check bodies while
 * twelve more bypassed the port and could not be tested at all, and the relevance
 * helpers lived in a consumer file that also re-derived the repository root — which
 * ten check bodies then got wrong at once. Mechanics a consumer keeps is mechanics
 * the next consumer writes again.
 */
export { readAll, readTracked, changedContaining, changedEnding, changedUnder, resolveWhen } from './_shared';
export type { IDocument, IWhenSpec, TWhen } from './_shared';
