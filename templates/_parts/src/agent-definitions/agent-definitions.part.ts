import type { ITemplateContext } from 'specwarden';

import type { IPart, IPartOptions } from '../_shared/part.model';
import { header, literal, tierOption } from '../_shared/render.util';

/** Where the role files live, for an assistant that keeps them somewhere else. */
export interface IAgentDefinitionsOptions extends IPartOptions {
  readonly agentsDir?: string;
}

/**
 * The agent role definitions parse and say what they are for.
 *
 * The failure this catches has no log line anywhere: frontmatter that does not parse loads
 * as NO role, and the assistant proceeds with whatever default it had.
 */
export const agentDefinitionsPart = (ctx: ITemplateContext, o: IAgentDefinitionsOptions = {}): IPart => {
  const agentsDir = o.agentsDir ?? '.claude/agents';
  return {
    files: [
      {
        path: 'checks/agents/agent-definitions.check.mjs',
        body: `${header(
          '`agent-definitions` — every role file parses and says what it is for.',
          `${o.header ?? 'Broken frontmatter loads as no role, silently: it surfaces days later as "why did it do that".'}\n\`agentsDir\` is where your assistant keeps its roles; \`required\` is the frontmatter each must carry.`,
        )}
import { agentDefinitions } from '@specwarden/agents';

export const check = agentDefinitions({
${tierOption(ctx)}  agentsDir: ${literal(agentsDir)},
  required: ['name', 'description'],
  rule: 'Every agent definition parses and declares what it is for.',
});
`,
      },
    ],
    rules: [],
  };
};
