/**
 * A starting tree for a repository that coding agents work in.
 *
 * The failure modes are different in kind: an agent reads documentation as
 * instructions, so a stale path is a wrong action taken confidently; a role file with
 * broken frontmatter loads as no role; and an irreversible action needs a guard that
 * runs BEFORE it, not a paragraph asking nicely.
 */
export { agentic } from './agentic/agentic.template';
