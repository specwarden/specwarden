/**
 * `doc-paths` — every repository-relative path named in documentation resolves.
 *
 * The highest-value check in an agentic repository. An agent follows a path, finds
 * nothing, and INVENTS the rest — confidently, in a diff. A human hitting the same dead
 * link shrugs and greps; the agent writes code against a file that does not exist.
 */
import { docPaths } from '@specwarden/docs';

export const check = docPaths({
  id: 'doc-paths',
  title: 'paths named in documentation exist',
  tier: 'fast',
  docs: '**/*.md',
});
