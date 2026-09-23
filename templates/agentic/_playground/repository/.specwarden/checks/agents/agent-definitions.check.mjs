// `agent-definitions` — every role file parses and says what it is for.
// Broken frontmatter loads as no role, silently: it surfaces days later as "why did it do that".
// `agentsDir` is where your assistant keeps its roles; `required` is the frontmatter each must carry.
import { agentDefinitions } from '@specwarden/agents';

export const check = agentDefinitions({
  agentsDir: '.claude/agents',
  required: ['name', 'description'],
  rule: 'Every agent definition parses and declares what it is for.',
});
