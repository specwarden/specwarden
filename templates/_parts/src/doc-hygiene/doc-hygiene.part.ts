import type { ITemplateContext } from 'specwarden';

import type { IPart, IPartOptions } from '../_shared/part.model';
import { header, literal, tierOption } from '../_shared/render.util';

const WHY = 'A corpus stops being read through structural decay long before anybody says so.';

/** Structural decay in documentation — links, section pointers, tables that stopped being tables. */
export const docHygienePart = (ctx: ITemplateContext, o: IPartOptions = {}): IPart => ({
  files: [
    {
      path: 'checks/docs/doc-hygiene.check.mjs',
      body: `${header(
        '`doc-hygiene` — links resolve, section pointers exist, a table cell stays a cell.',
        `${o.header ?? WHY}\n\`ratchet\` is how many over-long table rows are tolerated; it only turns down.`,
      )}
import { docHygiene } from '@specwarden/docs';

export const check = docHygiene({
${tierOption(ctx)}  docs: ${literal(ctx.docs)},
  rule: 'A document keeps its links resolving and its tables tables.',
});
`,
    },
  ],
  rules: [],
});
