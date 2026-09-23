import type { ICheckIdentity, TTier } from 'specwarden';

/**
 * The identity a plans check takes: the engine's, with `tier` optional. Every check here
 * only reads files, so `fast` is the tier each belongs in; absent, it is `fast`.
 */
export interface IPlanCheckIdentity extends Omit<ICheckIdentity, 'tier' | 'title'> {
  /** Absent: the rule's statement — every check here names the rule it enforces. */
  readonly title?: string;
  readonly tier?: TTier;
}

/** Where plans live when a repository does not say — the folder the scaffolds write. */
export const DEFAULT_PLANS_DIR = 'docs/_plans';

/** Where a harvested plan goes when a repository does not say. OUTSIDE the plans folder,
 * because plans are flat and a folder inside it is a hard failure. */
export const DEFAULT_ARCHIVE_DIR = 'docs/_plans-archive';
