import type { ICheck, IRule, TTier } from '../../../domain';
import { CHECK_CONTRACT_VERSION } from '../../../domain';
import { orphanChecks } from '../rule-audit/rule-audit.util';

export interface IOrphanCheckOptions {
  /** The full set of check ids to audit, as a thunk read at run time (so the check
   * sees the registry as it stands, itself excluded). */
  readonly checkIds: () => readonly string[];
  /** The declared rules, as a THUNK. Read at run time for the same reason `checkIds`
   * is: the harness contributes the rule its own checks enforce, and a snapshot taken
   * while the roster was still being built reports those checks as orphans. */
  readonly rules: () => readonly IRule[];
  readonly id?: string;
  readonly advisory?: boolean;
  /** The tier it runs in. Default `fast`; a repository with its own tier names passes
   * one of those — the only check that ignored the tier vocabulary was this one. */
  readonly tier?: TTier;
}

/**
 * `orphan-check` — a check the product gains for its own sake: an enforcer that names
 * no rule is a defect (the asymmetry a rule may stand alone when declared, an enforcer
 * may not). It is a P-zone check — it survives renaming the project. Whether it blocks
 * or only warns is the consumer's `advisory` choice. It reports the COUNT and the ids,
 * not one finding per orphan, so it stays readable.
 */
export function orphanCheck(options: IOrphanCheckOptions): ICheck {
  const id = options.id ?? 'orphan-check';
  return {
    id,
    title: 'every check enforces a declared rule',
    tier: options.tier ?? 'fast',
    zone: 'product',
    capabilities: [],
    contractVersion: CHECK_CONTRACT_VERSION,
    advisory: options.advisory ?? true,
    hint: 'Declare a rule that names this check in .specwarden/rules.mjs, or state why it enforces nothing.',
    when: () => true,
    run: () => {
      const ids = options.checkIds().filter((c) => c !== id);
      const orphans = orphanChecks(ids, options.rules());
      if (orphans.length === 0) return { ok: true, findings: [] };
      const shown = orphans.slice(0, 8).join(', ');
      return {
        ok: false,
        findings: [
          {
            severity: 'error',
            message: `${orphans.length} check(s) enforce no declared rule: ${shown}${orphans.length > 8 ? ', …' : ''}`,
            ruleId: id,
          },
        ],
      };
    },
  };
}
