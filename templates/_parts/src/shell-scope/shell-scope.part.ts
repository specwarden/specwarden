import type { ITemplateContext } from 'specwarden';

import type { IPart, IPartOptions } from '../_shared/part.model';

/**
 * `local` outside a function — the shell defect that only appears under `set -e`.
 *
 * Ships LIVE rather than as an example, because the only fact it needs is where the
 * scripts are, and a wrong pathspec makes it inert loudly (it reports how many files it
 * read). Everything else about it is a property of `sh` itself.
 */
export const shellScopePart = (ctx: ITemplateContext, o: IPartOptions & { readonly pathspecs?: readonly string[] } = {}): IPart => {
  // No shell, no check. Its empty-corpus report is a FAILURE by design — a check that
  // examined nothing must never pass — so writing it into a repository with no scripts
  // makes the scaffold itself the reason the first run is red.
  if (ctx.hasShellScripts === false) return { files: [], rules: [] };
  const pathspecs = o.pathspecs ?? ['scripts/**/*.sh', '*.sh'];
  return {
    files: [
      {
        path: 'checks/ops/shell-local-scope.check.mjs',
        body: `/**
 * \`shell-local-scope\` — \`local\` is only legal inside a function.
 *
 * At top level it is a runtime error, and under \`set -e\` that error ends the script —
 * often long after the line that introduced it, in a deploy, at the worst moment. The
 * script parses, shellcheck is happy, and the failure waits.
 *
 * The pathspecs below are yours: a vendored script is not this repository's to style.
 */
import { shellLocalScope } from 'specwarden-module-ops';

export const check = shellLocalScope({
  id: 'shell-local-scope',
  title: 'no \`local\` outside a function',
  tier: '${ctx.tier}',
  pathspecs: [${pathspecs.map((p) => `'${p}'`).join(', ')}],
  when: (changed) => changed.some((f) => f.endsWith('.sh')),
  hint: 'Move the declaration inside a function, or drop \`local\` and name the variable so it cannot collide.',
});
`,
      },
    ],
    rules: [
      {
        id: 'a-script-fails-where-it-is-wrong',
        statement: 'A shell script declares `local` only inside a function, so a mistake fails at the line that made it.',
        owner: '',
        enforcement: { checkIds: ['shell-local-scope'] },
      },
    ],
  };
};
