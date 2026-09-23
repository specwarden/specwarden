/**
 * Checks over DOCUMENTATION: that the paths it names resolve, that the symbols it
 * names exist, that its counts match reality, that it sits where it belongs, and that
 * it stays hygienic.
 *
 * A module rather than engine furniture because every one of them encodes a house
 * style — where documents live, what a symbol looks like, which words hedge a number.
 * A repository with no documentation to speak of should not be carrying any of it.
 */
export {
  docCounts,
  claimPattern,
  scanCounts,
  scanOrdinals,
  menuLabels,
  duplicateMenuNumbers,
} from './doc-counts/doc-counts.check';
export type {
  IDocCountsOptions,
  IAllowedClaim,
  IMenuOptions,
  ICountHit,
  IOrdinalHit,
} from './doc-counts/doc-counts.check';
export { docPaths, DOC_PATH_RE } from './doc-paths/doc-paths.check';
export type { IDocPathsOptions } from './doc-paths/doc-paths.check';
export { docSymbols } from './doc-symbols/doc-symbols.check';
export type { IDocSymbolsOptions } from './doc-symbols/doc-symbols.check';
export { docPlacement } from './doc-placement/doc-placement.check';
export type { IDocPlacementOptions } from './doc-placement/doc-placement.check';
export { docHygiene } from './doc-hygiene/doc-hygiene.check';
export type { IDocHygieneOptions } from './doc-hygiene/doc-hygiene.check';
export { DEFAULT_HEDGE, DEFAULT_ORDINAL_LEAD, DEFAULT_NUMBER, DEFAULT_DATED } from './doc-counts/doc-counts.check';
export type { IClaimGrammar } from './doc-counts/doc-counts.check';
export { DEFAULT_SYMBOL_REF_RE, DEFAULT_DECL_RE } from './doc-symbols/doc-symbols.check';
export { docsChecks } from './docs-checks/docs-checks.check';
export type { IDocsChecksOptions, TDocsOverride } from './docs-checks/docs-checks.check';
