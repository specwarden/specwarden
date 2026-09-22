import type { ICheck, ICheckIdentity, IFinding, IRule } from '../../domain';
import { computeCoverage } from '../../domain';
import { buildCheck, verdictFrom } from '../../primitives/_shared';
import { ruleOwnerFindings } from '../../runtime/rules/rule-audit/rule-audit.util';

export interface IRuleCoverageOptions extends ICheckIdentity {
  /** The declared rules — evaluated live, so the check reflects the current set. */
  readonly rules: () => readonly IRule[];
}

/**
 * Rule coverage under a ratchet (rules subplan §4). The debt it counts is the
 * number of rules declared but neither enforced NOR given a reason — never the
 * not-mechanizable ones, whose stated reason is knowledge, not debt. Ratcheting
 * those would push someone to delete the reason instead of solving the problem.
 * The number only turns down.
 *
 * A PRODUCT check: the coverage arithmetic is universal; the rule set is supplied.
 */
export function ruleCoverage(options: IRuleCoverageOptions): ICheck {
  return buildCheck({ ...options, zone: 'product' }, ['read'], (ctx) => {
    const cov = computeCoverage(options.rules());
    const findings: IFinding[] =
      cov.unenforcedWithoutReason > 0
        ? [{ severity: 'error', message: `${cov.unenforcedWithoutReason} rule(s) declared but neither enforced nor given a reason (of ${cov.total} total; ${cov.enforced} enforced, ${cov.notMechanizable} not-mechanizable). Enforce it, or state why it cannot be.`, ruleId: options.id }]
        : [];
    return verdictFrom(findings, ctx.ratchet ?? options.ratchet);
  });
}

export interface IRuleOwnerResolvesOptions extends ICheckIdentity {
  readonly rules: () => readonly IRule[];
}

/**
 * A rule's owner document exists (rules subplan §3). A rule whose owner is gone is
 * a rule with no place its rationale is written — enforced or not, nobody can find
 * out why it is there.
 */
export function ruleOwnerResolves(options: IRuleOwnerResolvesOptions): ICheck {
  return buildCheck({ ...options, zone: 'product' }, ['read'], (ctx) => {
    const findings = ruleOwnerFindings(options.rules(), ctx.files, options.id);
    return verdictFrom(findings, 0);
  });
}
