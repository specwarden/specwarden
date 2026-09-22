/**
 * `agent-definitions` — every role file is loadable and says what it is for.
 *
 * A role file with broken frontmatter does not error: it loads as no role, and the
 * agent proceeds with whatever default it had. The failure surfaces days later as
 * "why did it do that", with nothing in any log pointing here.
 *
 * `agentsDir` is the one fact that is yours — the directory below is Claude Code's
 * layout. Another assistant keeps its roles elsewhere; the check does not care which,
 * only that the files parse and declare the fields you require.
 */
import { agentDefinitions } from '@specwarden/agents';

export const check = agentDefinitions({
  id: 'agent-definitions',
  title: 'every agent definition parses and declares its purpose',
  tier: 'fast',
  agentsDir: '.claude/agents',
  required: ['name', 'description'],
});
