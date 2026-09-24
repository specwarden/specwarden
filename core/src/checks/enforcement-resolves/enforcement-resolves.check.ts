import type { ICheck, ICheckIdentity, IFinding, IRule } from '../../domain';
import { buildCheck, verdictFrom } from '../../primitives/_shared';

export interface IEnforcementResolvesOptions extends ICheckIdentity {
  /** The declared rules — a thunk, so the check sees the set as it stands. */
  readonly rules: () => readonly IRule[];
  /**
   * Every registered check id: the enforcers the runner will actually execute.
   * A thunk for the same reason — the roster is assembled at config load.
   */
  readonly roster: () => readonly string[];
  /**
   * Enforcer ids that live OUTSIDE the check roster and are real anyway — a
   * perimeter policy, a guard compiled into a pre-action hook. It is a thunk over the
   * modules that DECLARE them, never a hand-written list: the whole point is that an
   * id which stops being declared stops resolving, so copying the names here would
   * reproduce the defect this check exists for.
   */
  readonly enforcers?: () => readonly string[];
}

/**
 * Every enforcer a rule NAMES actually exists.
 *
 * `ruleCoverage` counts a rule as enforced because its `enforcement.enforcedBy` is
 * non-empty. It never resolves the ids, and `orphanCheck` walks the other direction
 * (check → rule), so between them a rule can name an enforcer that no roster
 * holds and both report green over it. That is not cosmetic: the rules whose
 * enforcement is most worth naming are the irreversible ones, and "declared,
 * enforced by nothing, reported as covered" is strictly worse than "declared,
 * unenforced, and says so" — the second is visible in the coverage number.
 *
 * The unresolvable id arrives in one of two ways and this check does not care which:
 * a typo, or an enforcement layer that was written, declared and then never wired.
 *
 * A PRODUCT check: the rule↔enforcer link is universal. WHICH rosters hold
 * enforcers in a given repository is the consumer's fact, supplied as thunks.
 */
export function enforcementResolves(options: IEnforcementResolvesOptions): ICheck {
  return buildCheck({ ...options, zone: 'product' }, [], () => {
    const known = new Set<string>([...options.roster(), ...(options.enforcers?.() ?? [])]);
    const findings: IFinding[] = [];

    for (const rule of options.rules()) {
      if (!('enforcedBy' in rule.enforcement)) continue;
      for (const id of rule.enforcement.enforcedBy) {
        if (known.has(id)) continue;
        findings.push({
          severity: 'error',
          message:
            `rule '${rule.id}' names enforcer '${id}', which is not a registered check and not ` +
            'declared as a perimeter policy — the rule counts as enforced and nothing enforces it.',
        });
      }
    }

    return verdictFrom(findings, 0);
  });
}
