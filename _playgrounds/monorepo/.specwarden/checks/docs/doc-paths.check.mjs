/**
 * `doc-paths` — every repository-relative path named in documentation resolves.
 *
 * Worth more in a monorepo than anywhere else: paths cross package boundaries, and a
 * package that moves takes every document naming it with it.
 */
import { docPaths } from '@specwarden/docs';

export const check = docPaths({
  id: 'doc-paths',
  title: 'paths named in documentation exist',
  tier: 'fast',
  docs: '**/*.md',
});
