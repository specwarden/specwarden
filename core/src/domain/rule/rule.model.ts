import type { TZone } from '../zone/zone.model';

/**
 * A rule — an assertion that must hold. It is the product's headline unit: the
 * whole metric is how many rules a repository declares, how many are enforced, and
 * how many are deliberately not — a number neither Spec Kit nor OpenSpec can name
 * about itself. The symmetry that is the point: a rule with no enforcer is allowed
 * WHEN DECLARED; an enforcer with no rule is a defect (the orphan check).
 */

/** Either the checks that enforce a rule (many-to-one), or a stated reason it is
 * not mechanizable. The reason is an assertion, not an apology — why enforcement is
 * impossible, not that nobody got to it — and there is no way to state "unenforced"
 * without one. */
export type TRuleEnforcement =
  | { readonly checkIds: readonly string[] }
  | { readonly notMechanizable: string };

export interface IRule {
  readonly id: string;
  /** The assertion itself, in one line. */
  readonly statement: string;
  /** The document that owns the rule — where its rationale is written. */
  readonly owner: string;
  readonly enforcement: TRuleEnforcement;
  readonly zone?: TZone;
  /** Marks a rule whose violation cannot be undone — a deleted volume, a force
   * push, a dropped column. These are the rules the constraint card is generated
   * from, so the card and the registry cannot drift. */
  readonly irreversible?: boolean;
  /**
   * The line this rule contributes to the constraint card, when it is irreversible.
   *
   * A SECOND WORDING, deliberately. `statement` is declarative and addressed to
   * whoever audits the register — "no invocation carries a volume flag". The card is
   * read mid-task by whoever is about to act, and what works there is an imperative
   * prohibition: "Never pass `-v` to any docker command." Generating the card from the
   * declarative wording produces lines that read as descriptions of a world rather than
   * as instructions, which is the one register where that distinction decides behaviour.
   *
   * It is not optional in practice: the generator refuses to emit a card for an
   * irreversible rule that has none, rather than silently degrading to a statement the
   * card's own shape rules would then reject.
   */
  readonly card?: string;
}

/** Whether a rule is actually enforced (named at least one check). */
export function isEnforced(rule: IRule): boolean {
  return 'checkIds' in rule.enforcement && rule.enforcement.checkIds.length > 0;
}

/** Whether a rule is declared not-mechanizable with a reason. */
export function isDeclaredUnenforceable(rule: IRule): boolean {
  return 'notMechanizable' in rule.enforcement && rule.enforcement.notMechanizable.trim().length > 0;
}

export interface IRuleCoverage {
  readonly total: number;
  readonly enforced: number;
  readonly notMechanizable: number;
  /** Declared but neither enforced nor given a reason — the debt the ratchet counts. */
  readonly unenforcedWithoutReason: number;
  readonly byZone: Readonly<Record<string, number>>;
}

/** The coverage number — the headline metric, computed from the rule set. */
export function computeCoverage(rules: readonly IRule[]): IRuleCoverage {
  let enforced = 0;
  let notMechanizable = 0;
  let unenforcedWithoutReason = 0;
  const byZone: Record<string, number> = {};
  for (const rule of rules) {
    if (isEnforced(rule)) enforced++;
    else if (isDeclaredUnenforceable(rule)) notMechanizable++;
    else unenforcedWithoutReason++;
    const zone = rule.zone ?? 'unzoned';
    byZone[zone] = (byZone[zone] ?? 0) + 1;
  }
  return { total: rules.length, enforced, notMechanizable, unenforcedWithoutReason, byZone };
}
