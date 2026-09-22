/**
 * `doc-paths` — every repository-relative path named in documentation resolves.
 *
 * Including the paths inside `openspec/`: a change proposal that cites a file which
 * has moved is read as current by whoever picks the change up next.
 */
import { docPaths } from '@specwarden/docs';

export const check = docPaths({
  id: 'doc-paths',
  title: 'paths named in documentation exist',
  tier: 'fast',
  docs: '**/*.md',
});
