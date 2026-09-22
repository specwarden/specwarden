import type { ITemplateContext } from 'specwarden';

import type { IPart, IPartOptions } from '../_shared/part.model';

const DEFAULT_HEADER = `every repository-relative path named in documentation resolves.
 *
 * A file moves, the prose does not, and a reader — or an agent — follows the old path,
 * finds nothing, and invents the rest.
 *
 * More from the same module when you want them: \`docSymbols\` (a renamed class leaves
 * its old name in prose), \`docCounts\` ("seven services" in a document describing nine),
 * \`docHygiene\`, \`docPlacement\`.`;

/**
 * The documentation-path check.
 *
 * Documentation rots through paths before it rots through anything else: a rule stays
 * true for years while the file it names moves in a week.
 */
export const docPathsPart = (ctx: ITemplateContext, o: IPartOptions = {}): IPart => ({
  files: [
    {
      path: 'checks/docs/doc-paths.check.mjs',
      body: `/**
 * \`doc-paths\` — ${o.header ?? DEFAULT_HEADER}
 */
import { docPaths } from '@specwarden/docs';

export const check = docPaths({
  id: 'doc-paths',
  title: 'paths named in documentation exist',
  tier: '${ctx.tier}',
  docs: '${ctx.docs}',
});
`,
    },
  ],
  rules: [
    {
      id: 'paths-in-documentation-resolve',
      statement: 'Every repository-relative path named in documentation exists.',
      owner: '',
      enforcement: { checkIds: ['doc-paths'] },
    },
  ],
});
