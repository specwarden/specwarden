import type { ITemplateContext } from 'specwarden';

import type { IPart, IPartOptions } from '../_shared/part.model';

const DEFAULT_HEADER = `the document stays readable as it grows.
 *
 * Relative links that resolve, section pointers that exist, and no table cell that has
 * quietly become a paragraph. The fat-cell budget is a RATCHET, not a verdict: it holds
 * at today's count and fails on an increase, so an existing corpus is not a wall of
 * findings on day one.`;

/** Structural decay in documentation — links, section pointers, tables that stopped being tables. */
export const docHygienePart = (ctx: ITemplateContext, o: IPartOptions = {}): IPart => ({
  files: [
    {
      path: 'checks/docs/doc-hygiene.check.mjs',
      body: `/**
 * \`doc-hygiene\` — ${o.header ?? DEFAULT_HEADER}
 */
import { docHygiene } from 'specwarden-module-docs';

export const check = docHygiene({
  id: 'doc-hygiene',
  title: 'documentation stays readable',
  tier: '${ctx.tier}',
  docs: '${ctx.docs}',
});
`,
    },
  ],
  rules: [
    {
      id: 'documentation-stays-readable',
      statement: 'A document keeps its links resolving and its tables tables.',
      owner: '',
      enforcement: { checkIds: ['doc-hygiene'] },
    },
  ],
});
