import type { IRule, ITemplate, ITemplateContext, ITemplateFile } from 'specwarden';
import {
  agentDefinitionsPart,
  compose,
  docPathsPart,
  perimeterPart,
  planLifecyclePart,
} from '@specwarden/scaffold-parts';

/**
 * A starting tree for a repository that CODING AGENTS work in.
 *
 * The failures here are not the ordinary ones. An agent reads the documentation as
 * instructions, so a stale path is not an inconvenience — it is a wrong action taken
 * confidently. A role file with broken frontmatter loads as no role at all, silently. A
 * plan nobody archived keeps being read as current work months after it shipped, and a
 * decision whose rejected alternatives lost their reasons gets reopened every quarter.
 * And an action that cannot be undone — a force-push, a dropped volume — is the one
 * class where "the model usually gets it right" is not good enough.
 *
 * So this template wires four things: the role definitions, the documentation an agent
 * reads, the plan and decision lifecycle, and a PERIMETER — rules evaluated BEFORE an
 * action runs, as data rather than as prose the model may or may not have read.
 *
 * No config fragment: the engine reads the perimeter's rule ids as enforcers itself.
 *
 * The documentation corpus is every tracked document: `AGENTS.md` and `CLAUDE.md` are the
 * first files an agent follows, and a docs-directory glob left exactly those unread. The
 * plan archive is skipped — a finished plan names files as they were.
 */
const assembled = (ctx: ITemplateContext) =>
  compose(
    agentDefinitionsPart(ctx),
    docPathsPart(ctx, {
      header: 'An agent follows a dead path, finds nothing, and INVENTS the rest — confidently, in a diff.',
      docs: '**/*.md',
      except: ['docs/_plans-archive/'],
    }),
    planLifecyclePart(ctx),
    perimeterPart(),
  );

export const agenticTemplate: ITemplate = {
  name: 'agentic',
  describe:
    'A repository coding agents work in — role files, agent-read docs, plan and decision lifecycle, a perimeter.',
  requires: ['@specwarden/agents', '@specwarden/plans', '@specwarden/docs'],

  files: (ctx: ITemplateContext): readonly ITemplateFile[] => assembled(ctx).files,
  rules: (ctx: ITemplateContext): readonly IRule[] => assembled(ctx).rules,
};
