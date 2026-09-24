import type { ITemplateContext } from 'specwarden';

import type { IPart, IPartOptions } from '../_shared/part.model';
import { header, literal, tierOption } from '../_shared/render.util';

const WHY =
  'At top level it is a runtime error, and under `set -e` it ends the script — in a deploy, long\nafter the line that introduced it.';

/**
 * `local` outside a function — the shell defect that only appears under `set -e`.
 *
 * Ships LIVE: the only fact it needs is where the scripts are, and a wrong pathspec makes
 * it fail loudly (it reports how many files it read). Everything else is a property of
 * `sh` itself.
 */
export const shellScopePart = (
  ctx: ITemplateContext,
  o: IPartOptions & { readonly pathspecs?: readonly string[] } = {},
): IPart => {
  // No shell, no check. Its empty-corpus report is a FAILURE by design, so writing it into
  // a repository with no scripts makes the scaffold itself the reason the first run is red.
  if (ctx.hasShellScripts === false) return { files: [], rules: [] };
  const pathspecs = o.pathspecs ?? ['scripts/**/*.sh', '*.sh'];
  return {
    files: [
      {
        path: 'checks/ops/shell-scope.check.mjs',
        body: `${header(
          '`shell-scope` — `local` is only legal inside a function.',
          `${o.header ?? WHY}\n\`scripts\` are the ones that are yours: a vendored script is not this repository's to style.`,
        )}
import { shellScope } from '@specwarden/ops';

export const check = shellScope({
${tierOption(ctx)}  scripts: [${pathspecs.map(literal).join(', ')}],
  rule: 'A shell script declares \`local\` only inside a function, so a mistake fails at the line that made it.',
  hint: 'Move the declaration inside a function, or drop \`local\` and name the variable so it cannot collide.',
});
`,
      },
    ],
    rules: [],
  };
};
