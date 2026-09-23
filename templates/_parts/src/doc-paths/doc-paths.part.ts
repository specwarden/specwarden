import type { ITemplateContext } from 'specwarden';

import type { IPart, IPartOptions } from '../_shared/part.model';
import { header, literal, tierOption } from '../_shared/render.util';

const WHY = 'A file moves, the prose does not, and a reader follows the old path to nothing.';

/** Where the documentation is, when a template knows better than the directory init found. */
export interface IDocPathsOptions extends IPartOptions {
  /**
   * The corpus, replacing the detected one. `**\/*.md` wherever a root document — a
   * README, a router file an agent reads first — is part of what a reader follows: a
   * docs-directory glob leaves exactly those unread.
   */
  readonly docs?: string;
  /** Trees whose paths are history — an archive of finished plans names files as they were. */
  readonly skipDirs?: readonly string[];
}

/** The documentation-path check: documentation rots through paths before anything else. */
export const docPathsPart = (ctx: ITemplateContext, o: IDocPathsOptions = {}): IPart => {
  const skip = o.skipDirs?.length ? `  skipDirs: [${o.skipDirs.map(literal).join(', ')}],\n` : '';
  return {
    files: [
      {
        path: 'checks/docs/doc-paths.check.mjs',
        body: `${header(
          '`doc-paths` — every repository-relative path named in documentation resolves.',
          `${o.header ?? WHY}\n\`docs\` is what is read; \`skipDirs\` leaves out a tree whose paths are history.`,
        )}
import { docPaths } from '@specwarden/docs';

export const check = docPaths({
${tierOption(ctx)}  docs: ${literal(o.docs ?? ctx.docs)},
${skip}  rule: 'Every repository-relative path named in documentation exists.',
});
`,
      },
    ],
    rules: [],
  };
};
