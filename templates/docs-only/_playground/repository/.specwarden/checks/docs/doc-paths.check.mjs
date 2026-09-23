/**
 * `doc-paths` — every repository-relative path named in a document resolves.
 *
 * In a repository that IS documentation this is the load-bearing check: a path that
 * stops resolving is the difference between a handbook and a maze.
 */
import { docPaths } from '@specwarden/docs';

export const check = docPaths({
  id: 'doc-paths',
  title: 'paths named in documentation exist',
  tier: 'fast',
  docs: 'docs/**/*.md',
});
