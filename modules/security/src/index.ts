/**
 * The credential scan.

 * It is the check most repositories want first, and it is still a module: it carries a
 * library of vendor formats, and a library of anyone's formats is an opinion. The
 * engine holding it would mean every consumer inherits five vendors it may not use.
 */
export { secretScan } from './secret-scan/secret-scan.check';
export type { ISecretScanOptions, ISecretAllowEntry } from './secret-scan/secret-scan.check';
export {
  BUILT_IN_SECRET_PATTERNS,
  DEFAULT_PLACEHOLDER_MARKERS,
  DEFAULT_SECRET_EXCEPT,
} from './secret-scan/secret-scan.check';
export type { ISecretPattern } from './secret-scan/secret-scan.check';
