import type { ITemplateContext } from 'specwarden';

import type { IPart } from '../_shared/part.model';
import { exampleRule, header, literal, switchOn, tierOption } from '../_shared/render.util';

/**
 * "Each document sits where its kind belongs" — as an `.example`, because the CONTRACT
 * is the repository's: one house keeps runbooks beside the scripts they run, another
 * keeps every operational document in one folder. Left unconfigured it fails loudly — a
 * document no row describes is a finding — which is the right direction, and still a
 * red first run nobody chose.
 */
export const docPlacementExamplePart = (ctx: ITemplateContext): IPart => ({
  files: [
    {
      path: 'checks/docs/doc-placement.check.mjs.example',
      body: `${header(
        '`doc-placement` — each document sits where its kind belongs.',
        `OFF until \`allowed\` is YOUR placement contract: one regex per kind of document. A document
no row matches is a finding — an undecided location is where a second copy of a rule is born.
${switchOn('doc-placement')}`,
      )}
import { docPlacement } from '@specwarden/docs';

export const check = docPlacement({
  id: 'doc-placement',
${tierOption(ctx)}  docs: ${literal(ctx.docs)},
  // REPLACE: one row per document KIND, with a comment saying which kind it is.
  allowed: [/^README\\.md$/, /^docs\\/.*\\.md$/, /^\\.specwarden\\/.*\\.md$/],
});
`,
    },
  ],
  rules: [exampleRule('doc-placement', 'Every document sits where the placement contract puts its kind.')],
});
