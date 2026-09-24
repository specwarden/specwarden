import type { IRule, ITemplate, ITemplateContext, ITemplateFile } from 'specwarden';
import {
  compose,
  docPathsPart,
  docSymbolsExamplePart,
  scriptWrappersPart,
  secretScanPart,
} from '@specwarden/scaffold-parts';

/**
 * A starting tree for an ordinary TypeScript repository.
 *
 * WHAT IT ENABLES, and why only this much. A credential scan, because no repository
 * wants one committed and the check cannot be wrong about a tree it has just met. The
 * doc-path check, because the commonest way documentation rots is a file moving while
 * the prose does not. Lint and test as wrapped commands — when the manifest declares
 * them — because every repository of this kind already has both, and running them
 * as checks is what puts them in one tier with everything else.
 *
 * WHAT IT LEAVES OUT, deliberately. No count check — its vocabulary is English. No plan
 * or decision checks — those assume a way of working. The symbol check ships as an
 * `.example`, since it must be told what a symbol looks like here and a guessed suffix
 * list finds the wrong names. A template that turned everything on would be red on the first
 * run, and the first run is what decides whether the tool is kept.
 *
 * The parts it composes are shared with every other template; what is local here is the
 * CHOICE of them, and the prose saying why each earns its place in a repository of this
 * kind.
 */
const assembled = (ctx: ITemplateContext) =>
  compose(secretScanPart(ctx), docPathsPart(ctx), docSymbolsExamplePart(ctx), scriptWrappersPart(ctx));

export const nodeTsTemplate: ITemplate = {
  name: 'node-ts',
  describe: 'An ordinary TypeScript repository — credential scan, doc paths and symbols, lint and tests.',
  requires: ['@specwarden/security', '@specwarden/docs'],

  files: (ctx: ITemplateContext): readonly ITemplateFile[] => assembled(ctx).files,
  rules: (ctx: ITemplateContext): readonly IRule[] => assembled(ctx).rules,
};
