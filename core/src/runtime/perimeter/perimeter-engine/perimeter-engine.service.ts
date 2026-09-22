import { ALLOW, type IActionIntent, type IPerimeterRule, type IPerimeterVerdict } from '../../../domain';

/**
 * The perimeter — a decision computed BEFORE an agent acts, on the intent of one
 * call. Distinct from the check engine on purpose: a check reads the tree in
 * batches by tier; this reads one intent and must answer fast.
 *
 * The load-bearing invariant, pinned by test: the perimeter FAILS OPEN. A rule
 * that throws is skipped, not treated as a block — a broken perimeter that looks
 * like a block is worse than none, because it halts work while wearing the face of
 * a rule. Only a definite `blocked` verdict blocks; everything else allows.
 */
export class PerimeterEngine {
  constructor(private readonly rules: readonly IPerimeterRule[]) {}

  evaluate(intent: IActionIntent): IPerimeterVerdict {
    for (const rule of this.rules) {
      let verdict: IPerimeterVerdict;
      try {
        verdict = rule.evaluate(intent);
      } catch {
        continue; // a rule's own failure opens, never blocks
      }
      if (verdict.blocked) return verdict;
    }
    return ALLOW;
  }
}
