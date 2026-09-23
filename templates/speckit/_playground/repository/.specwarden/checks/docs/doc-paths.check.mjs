/**
 * `doc-paths` — every repository-relative path named in documentation resolves.
 *
 * Including the paths inside `specs/`: a feature's plan citing a file that has moved is
 * read as current by whoever implements the feature next.
 */
import { docPaths } from '@specwarden/docs';

export const check = docPaths({
  id: 'doc-paths',
  title: 'paths named in documentation exist',
  tier: 'fast',
  docs: '**/*.md',
});
