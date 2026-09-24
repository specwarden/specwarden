import type { ICheck, TTier, TWhen } from 'specwarden';
import { checkOptions } from 'specwarden';

import { DEFAULT_ARCHIVE_DIR, DEFAULT_PLANS_DIR } from '../_shared/corpus/corpus.util';
import { type IDecisionLogShapeOptions, decisionLogShape } from '../decision-log-shape/decision-log-shape.check';
import { type IPlanShapeOptions, planShape } from '../plan-shape/plan-shape.check';
import { type IPlanStalenessOptions, planStaleness } from '../plan-staleness/plan-staleness.check';

/** One check's own options laid over what the preset gives it, or `false` to leave it out. */
export type TPlansOverride<T> = false | Partial<T>;

export interface IPlansChecksOptions {
  /** The flat plans folder. Default: `docs/_plans`. */
  readonly plansDir?: string;
  /** Where a harvested plan goes. Default: `docs/_plans-archive`. */
  readonly archiveDir?: string;
  /** The tier every check runs in. Default: `fast`. */
  readonly tier?: TTier;
  /** When every check matters. Default: each check's own — `plan-staleness` when a markdown
   * file changed, the other two always. */
  readonly when?: TWhen;
  /** `plan-staleness`, over the preset's. */
  readonly staleness?: TPlansOverride<IPlanStalenessOptions>;
  /** `plan-shape`, over the preset's. */
  readonly shape?: TPlansOverride<IPlanShapeOptions>;
  /** `decision-log-shape`, over the preset's — it reads the plans in `plansDir`. */
  readonly decisionLog?: TPlansOverride<IDecisionLogShapeOptions>;
}

/** Why a preset refuses the identity a single check takes — it builds three. */
const ONE_CHECK_ONLY = (option: string): { refused: string } => ({
  refused: `a preset builds three checks, and ${option} belongs to one of them — give it in that check's own options, e.g. \`shape: { ${option}: … }\``,
});

/**
 * The whole module in one call: the three checks, each with its own id and title, over one
 * plans folder.
 *
 * WHY A PRESET. Wired one factory at a time the module was 23 lines, naming the plans
 * folder twice and handing `planShape` four regexes every English repository writes the
 * same way. Everything but the two folders has a default, and the folders have one too —
 * the ones the scaffolds write.
 *
 * `tier` and `when` were accepted here and dropped: every check was built in `fast`,
 * whatever the preset was told. They now reach every check, and a check's own wins. The
 * identity a SINGLE check takes — an id, a title, a rule, a ratchet — is refused by name:
 * three checks cannot share one.
 */
export function plansChecks(options: IPlansChecksOptions = {}): ICheck[] {
  checkOptions(
    'plansChecks',
    options,
    {
      plansDir: { kind: 'string', nonEmpty: true },
      archiveDir: { kind: 'string', nonEmpty: true },
      tier: { kind: 'string' },
      when: { kind: ['function', 'object'] },
      staleness: { kind: ['object', 'boolean'] },
      shape: { kind: ['object', 'boolean'] },
      decisionLog: { kind: ['object', 'boolean'] },
      id: ONE_CHECK_ONLY('id'),
      title: ONE_CHECK_ONLY('title'),
      rule: ONE_CHECK_ONLY('rule'),
      ratchet: ONE_CHECK_ONLY('ratchet'),
    },
    { identity: false },
  );
  const plansDir = options.plansDir ?? DEFAULT_PLANS_DIR;
  const archiveDir = options.archiveDir ?? DEFAULT_ARCHIVE_DIR;
  // Each key only when it was given, so a check's own default — `plan-staleness` reading
  // only when a markdown file changed — is never overwritten by an `undefined`.
  const shared = {
    ...(options.tier === undefined ? {} : { tier: options.tier }),
    ...(options.when === undefined ? {} : { when: options.when }),
  };
  const checks: ICheck[] = [];

  if (options.staleness !== false) {
    checks.push(planStaleness({ ...shared, plansDir, archiveDir, ...options.staleness }));
  }
  if (options.shape !== false) {
    checks.push(planShape({ ...shared, plansDir, ...options.shape }));
  }
  if (options.decisionLog !== false) {
    checks.push(decisionLogShape({ ...shared, docs: `${plansDir}/*.md`, ...options.decisionLog }));
  }

  return checks;
}
