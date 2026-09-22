import type { ITemplateContext } from 'specwarden';

import type { IPart, IPartOptions } from '../_shared/part.model';

/** Where the role files live, for an assistant that keeps them somewhere else. */
export interface IAgentRolesOptions extends IPartOptions {
  readonly agentsDir?: string;
}

/**
 * The agent role definitions parse and say what they are for.
 *
 * The failure this catches has no log line anywhere: frontmatter that does not parse
 * loads as NO role, and the assistant proceeds with whatever default it had. It
 * surfaces days later as "why did it do that".
 */
export const agentRolesPart = (ctx: ITemplateContext, o: IAgentRolesOptions = {}): IPart => {
  const agentsDir = o.agentsDir ?? '.claude/agents';
  return {
    files: [
      {
        path: 'checks/agents/agent-definitions.check.mjs',
        body: `/**
 * \`agent-definitions\` — every role file is loadable and says what it is for.
 *
 * A role file with broken frontmatter does not error: it loads as no role, and the
 * agent proceeds with whatever default it had. The failure surfaces days later as
 * "why did it do that", with nothing in any log pointing here.
 *
 * \`agentsDir\` is the one fact that is yours — the directory below is Claude Code's
 * layout. Another assistant keeps its roles elsewhere; the check does not care which,
 * only that the files parse and declare the fields you require.
 */
import { agentDefinitions } from '@specwarden/agents';

export const check = agentDefinitions({
  id: 'agent-definitions',
  title: 'every agent definition parses and declares its purpose',
  tier: '${ctx.tier}',
  agentsDir: '${agentsDir}',
  required: ['name', 'description'],
});
`,
      },
    ],
    rules: [
      {
        id: 'an-agent-role-loads-or-fails-loudly',
        statement: 'Every agent definition parses and declares what it is for.',
        owner: '',
        enforcement: { checkIds: ['agent-definitions'] },
      },
    ],
  };
};
