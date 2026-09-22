import { defineConfig } from 'specwarden';

import { rules } from './rules.mjs';
import { rules as perimeterRules } from './perimeter.mjs';

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

  harness: {
    // The perimeter's rule ids count as enforcers: rules.mjs names them, and the hook
    // evaluates them, so renaming one there must fail a gate here rather than quietly
    // un-declaring a rule about an irreversible action.
    otherEnforcerIds: () => perimeterRules.map((r) => r.id),
  },

  /**
   * A diff touching one of these can affect anything, so relevance filtering is
   * skipped for it. Start empty; add a prefix when you notice a gate that should have
   * run and did not.
   */
  sharedBuildInputs: [],
});
