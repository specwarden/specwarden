import type { IRule, ITemplate, ITemplateContext, ITemplateFile } from 'specwarden';
import {
  compose,
  docCountsExamplePart,
  docHygienePart,
  docPathsPart,
  docPlacementExamplePart,
} from 'specwarden-scaffold-parts';

/**
 * A starting tree for a repository whose product IS documentation — a handbook, a
 * runbook collection, a knowledge base.
 *
 * Deliberately smaller than the code templates, and for a reason each time. No symbol
 * check: there is no code here for symbols to resolve against. No count check by
 * default: its vocabulary is English, and a documentation repository is the likeliest
 * place for that to be false — it ships as an `.example` instead, so a reader sees the
 * option and the caveat together rather than only the absence. Placement likewise: the
 * contract is the house's, and there is no universal one to guess.
 *
 * What it DOES enable is the pair that is load-bearing here. A path that stops resolving
 * is the difference between a handbook and a maze, and structural decay — a dead section
 * pointer, a table cell that quietly became a paragraph — is how a corpus stops being
 * read long before anybody says so.
 */
const assembled = (ctx: ITemplateContext) =>
  compose(
    docPathsPart(ctx, {
      header: `every repository-relative path named in a document resolves.
 *
 * In a repository that IS documentation this is the load-bearing check: a path that
 * stops resolving is the difference between a handbook and a maze.`,
    }),
    docHygienePart(ctx),
    docCountsExamplePart(ctx),
    docPlacementExamplePart(ctx),
  );

export const docsOnly: ITemplate = {
  name: 'docs-only',
  describe: 'a repository whose product is documentation — paths, hygiene, counts, placement',
  requires: ['specwarden-module-docs'],

  files: (ctx: ITemplateContext): readonly ITemplateFile[] => assembled(ctx).files,
  rules: (ctx: ITemplateContext): readonly IRule[] => assembled(ctx).rules,
};
