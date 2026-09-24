/**
 * Checks over CODING-AGENT definitions — the frontmatter and shape of the role files
 * an assistant loads.

 * Wholly optional, and shaped by whichever assistant a consumer runs.
 */
export { agentDefinitions, parseFrontmatter } from './agent-definitions/agent-definitions.check';
export type { IAgentDefinitionsOptions } from './agent-definitions/agent-definitions.check';
