import type { IRule, ITemplate, ITemplateContext, ITemplateFile } from 'specwarden';
import { agentRolesPart, compose, docPathsPart, perimeterPart, planLifecyclePart } from '@specwarden/scaffold-parts';

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
 * The perimeter ships live, not as an example, and its rules are the two nobody
 * disagrees with. It fails OPEN by design: a broken guard must not become a broken
 * agent.
 */
const assembled = (ctx: ITemplateContext) =>
  compose(
    agentRolesPart(ctx),
    docPathsPart(ctx, {
      header: `every repository-relative path named in documentation resolves.
 *
 * The highest-value check in an agentic repository. An agent follows a path, finds
 * nothing, and INVENTS the rest — confidently, in a diff. A human hitting the same dead
 * link shrugs and greps; the agent writes code against a file that does not exist.`,
    }),
    planLifecyclePart(ctx),
    perimeterPart(),
  );

export const agentic: ITemplate = {
  name: 'agentic',
  describe:
    'a repository coding agents work in — role files, agent-read docs, plan and decision lifecycle, a perimeter',
  requires: ['@specwarden/agents', '@specwarden/plans', '@specwarden/docs'],

  files: (ctx: ITemplateContext): readonly ITemplateFile[] => assembled(ctx).files,
  rules: (ctx: ITemplateContext): readonly IRule[] => assembled(ctx).rules,
  configExtras: (ctx: ITemplateContext) => assembled(ctx).configExtras ?? { fields: '' },
};
