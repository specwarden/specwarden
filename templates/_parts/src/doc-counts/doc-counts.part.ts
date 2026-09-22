import type { ITemplateContext } from 'specwarden';

import type { IPart } from '../_shared/part.model';

/**
 * "A bare number in prose is a claim, and claims rot" — as an `.example`, because the
 * VOCABULARY it reasons with is English.
 *
 * The check tells a claim from a reference using hedges ("about", "roughly"), ordinal
 * lead-ins ("step", "phase") and date markers ("measured", "as of"). In a repository
 * documenting in another language every default finds nothing and it reports green,
 * which looks exactly like clean documentation.
 */
export const docCountsExamplePart = (ctx: ITemplateContext): IPart => ({
  files: [
    {
      path: 'checks/docs/doc-counts.check.mjs.example',
      body: `/**
 * \`doc-counts\` — a bare number in prose is a CLAIM, and claims rot.
 *
 * "Seven services" in a document describing nine. The number was right the day it was
 * written, and nothing tells a reader it stopped being right.
 *
 * WHY IT IS AN EXAMPLE, twice over:
 *
 *   1. Its grammar is ENGLISH by default — hedge, ordinalLead, numberPattern, dated.
 *      In another language the defaults match nothing and the check reports green,
 *      which is indistinguishable from clean documentation. The exported defaults
 *      (DEFAULT_HEDGE, DEFAULT_ORDINAL_LEAD, DEFAULT_NUMBER, DEFAULT_DATED) are a
 *      starting point to adapt, not a set to match.
 *   2. \`countableNouns\` is an inventory of what YOUR repository owns the count of.
 *      Empty means the check has nothing to look for.
 *
 * A count that is NORMATIVE — a threshold, a configured limit — is not a claim about an
 * inventory, so it belongs in the allowlist together with the paths where it is
 * legitimate. A descriptive count sharing the same phrase is then still reported.
 */
import { docCounts } from 'specwarden-module-docs';

export const check = docCounts({
  id: 'doc-counts',
  title: 'counts in prose match reality',
  tier: '${ctx.tier}',
  // The nouns whose "how many" lives in the repository rather than in prose.
  countableNouns: [],
  // Trees where a frozen number is correct by construction — generated maps, dated
  // studies, plans (which describe an intended future in the present tense).
  skipped: [],
  // Normative thresholds, each with the paths where it is legitimate.
  allowlist: () => [],
  when: (changed) => changed.some((f) => f.endsWith('.md')),
  hint: 'Re-derive the count rather than restating it, or allowlist it with the path.',
});
`,
    },
  ],
  rules: [],
});
