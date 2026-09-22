import type { ITemplateContext } from 'specwarden';

import type { IPart } from '../_shared/part.model';

/**
 * The symbol check, always as an `.example`, and that is the rule rather than caution.
 *
 * It has to be told what a symbol LOOKS like here: a suffix list (`Service`, `Handler`)
 * and, outside TypeScript, a declaration grammar. Written with an empty suffix list it
 * matches nothing, finds nothing and reports green — a check that cannot fail reporting
 * success, which is the defect class this engine exists against.
 *
 * So no template ships it live. It ships as a file that says what it needs.
 */
export const docSymbolsExamplePart = (ctx: ITemplateContext): IPart => ({
  files: [
    {
      path: 'checks/docs/doc-symbols.check.mjs.example',
      body: `/**
 * \`doc-symbols\` — documentation does not name classes that no longer exist.
 *
 * Docs decay through NAMES before they decay through rules. A renamed class leaves the
 * old name in prose; a reader greps the dead name, finds nothing, and invents the rest
 * while the invariants they just read were right.
 *
 * WHY IT IS AN EXAMPLE. Three of its inputs are facts about THIS repository:
 *
 *   suffixes     the endings that make a word a symbol — 'Service', 'Repository', …
 *                EMPTY MEANS INERT: it matches nothing and reports green, every time.
 *   code         where the declarations live, as git pathspecs.
 *   external     symbols owned by frameworks. Documentation may legitimately name them
 *                and they will never be found in your own sources.
 *
 * For a language that is not TypeScript, pass \`declaration\` — a RegExp whose first
 * group is the declared name. DEFAULT_DECL_RE covers class/interface/type/enum/const.
 *
 * Fill the suffixes in, rename to \`.check.mjs\`, and it starts finding things.
 */
import { docSymbols } from '@specwarden/docs';

export const check = docSymbols({
  id: 'doc-symbols',
  title: 'documentation names symbols that exist',
  tier: '${ctx.tier}',
  docs: '${ctx.docs}',
  // Where the declarations live.
  code: ['src/**/*.ts'],
  // The endings that make a word a symbol here. EMPTY MEANS INERT.
  suffixes: [],
  // Framework-owned names documentation may reference. Keep it sorted, keep it boring.
  external: [],
});
`,
    },
  ],
  rules: [],
});
