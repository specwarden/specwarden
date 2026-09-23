import type { ITemplateContext } from 'specwarden';

import type { IPart } from '../_shared/part.model';
import { exampleRule, header, literal, switchOn, tierOption } from '../_shared/render.util';

/**
 * "A bare number in prose is a claim, and claims rot" — as an `.example`, because the
 * nouns are an inventory only the repository has, and its grammar is English: in a
 * corpus written in another language every default finds nothing and it reports green.
 */
export const docCountsExamplePart = (ctx: ITemplateContext): IPart => ({
  files: [
    {
      path: 'checks/docs/doc-counts.check.mjs.example',
      body: `${header(
        '`doc-counts` — a bare count in prose is a claim, and claims rot: "seven services" beside nine.',
        `OFF until \`countableNouns\` names what THIS repository owns the count of — the three below
are a guess. Its grammar is English: \`hedge\`, \`ordinalLead\`, \`numberPattern\`, \`dated\` replace it.
${switchOn('doc-counts')}`,
      )}
import { docCounts } from '@specwarden/docs';

export const check = docCounts({
  id: 'doc-counts',
${tierOption(ctx)}  docs: ${literal(ctx.docs)},
  // REPLACE: the nouns whose "how many" lives in the repository rather than in prose.
  countableNouns: ['services', 'packages', 'modules'],
});
`,
    },
  ],
  rules: [exampleRule('doc-counts', 'A count in prose is re-derived from the repository, not restated.')],
});
