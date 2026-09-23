import type { ICheck } from 'specwarden';
import { checkOptions } from 'specwarden';

import { DEFAULT_ARCHIVE_DIR, DEFAULT_PLANS_DIR } from '../_shared/identity/identity.model';
import { type IDecisionLogShapeOptions, decisionLogShape } from '../decision-log-shape/decision-log-shape.check';
import { type IPlanShapeOptions, planShape } from '../plan-shape/plan-shape.check';
import { type IPlanStalenessOptions, planStaleness } from '../plan-staleness/plan-staleness.check';

/** One check's own options laid over what the preset gives it, or `false` to leave it out. */
export type TPlansOverride<T> = false | Partial<T>;

export interface IPlanChecksOptions {
  /** The flat plans folder. Default: `docs/_plans`. */
  readonly plansDir?: string;
  /** Where a harvested plan goes. Default: `docs/_plans-archive`. */
  readonly archiveDir?: string;
  /** `plan-staleness`, over the preset's. */
  readonly staleness?: TPlansOverride<IPlanStalenessOptions>;
  /** `plan-shape`, over the preset's. */
  readonly shape?: TPlansOverride<IPlanShapeOptions>;
  /** `decision-log-shape`, over the preset's — it reads the plans in `plansDir`. */
  readonly decisions?: TPlansOverride<IDecisionLogShapeOptions>;
}

/**
 * The whole module in one call: the three checks, with their conventional ids, over one
 * plans folder.
 *
 * WHY A PRESET. Wired one factory at a time the module was 23 lines, naming the plans
 * folder twice and handing `planShape` four regexes every English repository writes the
 * same way. Everything but the two folders has a default, and the folders have one too —
 * the ones the scaffolds write.
 */
export function planChecks(options: IPlanChecksOptions = {}): ICheck[] {
  checkOptions('planChecks', options, {
    plansDir: { kind: 'string' },
    archiveDir: { kind: 'string' },
    staleness: { kind: ['object', 'boolean'] },
    shape: { kind: ['object', 'boolean'] },
    decisions: { kind: ['object', 'boolean'] },
  });
  const plansDir = options.plansDir ?? DEFAULT_PLANS_DIR;
  const archiveDir = options.archiveDir ?? DEFAULT_ARCHIVE_DIR;
  const checks: ICheck[] = [];

  if (options.staleness !== false) {
    checks.push(
      planStaleness({
        id: 'plan-staleness',
        title: 'no plan outlives its work, and nothing cites the archive',
        tier: 'fast',
        plansDir,
        archiveDir,
        ...options.staleness,
      }),
    );
  }
  if (options.shape !== false) {
    checks.push(
      planShape({
        id: 'plan-shape',
        title: 'a plan names real gates, sizes nothing, and every phase has an acceptance',
        tier: 'fast',
        plansDir,
        ...options.shape,
      }),
    );
  }
  if (options.decisions !== false) {
    checks.push(
      decisionLogShape({
        id: 'decision-log-shape',
        title: 'a rejected alternative states why it lost',
        tier: 'fast',
        docs: `${plansDir}/*.md`,
        ...options.decisions,
      }),
    );
  }

  return checks;
}
