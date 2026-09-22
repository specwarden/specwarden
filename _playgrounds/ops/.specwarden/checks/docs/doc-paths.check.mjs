/**
 * `doc-paths` — every repository-relative path named in documentation resolves.
 *
 * An operational document is read under pressure. A path in a runbook that no longer
 * resolves costs minutes exactly when there are none, and the reader — already halfway
 * through an incident — has to guess what it became.
 */
import { docPaths } from '@specwarden/docs';

export const check = docPaths({
  id: 'doc-paths',
  title: 'paths named in documentation exist',
  tier: 'fast',
  docs: '**/*.md',
});
