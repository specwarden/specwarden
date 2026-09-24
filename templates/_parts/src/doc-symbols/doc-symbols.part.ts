import type { ITemplateContext } from 'specwarden';

import type { IPart } from '../_shared/part.model';
import { exampleRule, header, literal, switchOn, tierOption } from '../_shared/render.util';

/**
 * The symbol check, always as an `.example`: it has to be told what a symbol LOOKS like
 * here — the endings that make a word a class name, and outside TypeScript a declaration
 * grammar — and a guess at either finds the wrong things or nothing.
 */
export const docSymbolsExamplePart = (ctx: ITemplateContext): IPart => ({
  files: [
    {
      path: 'checks/docs/doc-symbols.check.mjs.example',
      body: `${header(
        '`doc-symbols` — documentation names no class that no longer exists.',
        `Switched off until \`suffixes\` are the endings that make a word a symbol HERE — the four
below are a guess — and \`code\` is where they are declared. Outside TypeScript, pass \`declaration\`.
${switchOn('doc-symbols')}`,
      )}
import { docSymbols } from '@specwarden/docs';

export const check = docSymbols({
  id: 'doc-symbols',
${tierOption(ctx)}  docs: ${literal(ctx.docs)},
  code: ['src/**/*.ts'],
  // REPLACE: the endings of this repository's own class names.
  suffixes: ['Service', 'Repository', 'Controller', 'Error'],
  // Framework-owned names documentation may mention and your sources never declare.
  external: [],
});
`,
    },
  ],
  rules: [exampleRule('doc-symbols', 'Documentation names only symbols the code still declares.')],
});
