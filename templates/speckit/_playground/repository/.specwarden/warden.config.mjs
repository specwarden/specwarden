import { defineConfig } from 'specwarden';

import { rules } from './rules.mjs';
import { source as specSource } from './spec-source.mjs';

/**
 * What this repository enforces — the part the tree cannot say for itself.
 *
 * The engine reads `checks/` by convention: every `*.check.mjs` under it is a check,
 * found without being named here. The harness's own audits — rule ownership, rule
 * coverage, orphans, enforcer resolution, ratchet direction — are assembled from
 * defaults and appear in the manifest without being declared. So this file holds only
 * what has no other home: plugins, ownership, relevance inputs, and the tier names.
 *
 * Checks are enabled DELIBERATELY, one file each. A check nobody chose, failing on day
 * one, teaches that this tool is noisy — and that lesson outlives the check.
 */
export default defineConfig({
  rules,

  // Where requirements and tasks come from. `specwarden sync-invariants` reads this
  // and reconciles it against the invariants deposited in the corpus; it PRINTS the
  // proposed edit and writes nothing, because turning a requirement's wording into an
  // invariant read as truth about behaviour is a person's decision.
  //
  // Swap specwarden-module-speckit for any other implementation of ISpecSource — two functions — and
  // nothing else here changes.
  specSource,

  // The other half of the reconciliation: where invariants are already deposited, and
  // how one is identified. Without it every requirement reads as "not deposited yet",
  // which is honest but noisy. The id pattern is your documentation's convention.
  // invariants: { docs: 'docs/**/*.md', idPattern: /<!--\s*invariant:\s*([a-z0-9-]+)\s*-->/g },

  /**
   * A diff touching one of these can affect anything, so relevance filtering is
   * skipped for it. Start empty; add a prefix when you notice a gate that should have
   * run and did not.
   */
  sharedBuildInputs: [],
});
