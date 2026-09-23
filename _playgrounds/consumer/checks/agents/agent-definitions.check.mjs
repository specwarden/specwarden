import { agentDefinitions } from '@specwarden/agents';

export const check = agentDefinitions({
  id: 'agent-definitions',
  title: 'every agent declares its tools',
  tier: 'fast',
  agentsDir: '.claude/agents',
});
