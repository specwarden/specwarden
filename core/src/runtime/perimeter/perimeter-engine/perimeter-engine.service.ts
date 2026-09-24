import { ALLOW, type IActionIntent, type IPerimeterPolicy, type IPerimeterVerdict } from '../../../domain';

/**
 * The perimeter — a decision computed BEFORE an agent acts, on the intent of one
 * call. Distinct from the check engine on purpose: a check reads the tree in
 * batches by tier; this reads one intent and must answer fast.
 *
 * The load-bearing invariant, pinned by test: the perimeter FAILS OPEN. A policy
 * that throws is skipped, not treated as a block — a broken perimeter that looks
 * like a block is worse than none, because it halts work while wearing the face of
 * a policy. Only a definite `blocked` verdict blocks; everything else allows.
 */
export class PerimeterEngine {
  constructor(private readonly policies: readonly IPerimeterPolicy[]) {}

  evaluate(intent: IActionIntent): IPerimeterVerdict {
    for (const policy of this.policies) {
      let verdict: IPerimeterVerdict;
      try {
        verdict = policy.evaluate(intent);
      } catch {
        continue; // a policy's own failure opens, never blocks
      }
      if (verdict.blocked) return verdict;
    }
    return ALLOW;
  }
}
