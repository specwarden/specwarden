/**
 * `doc-paths` — every repository-relative path named in documentation resolves.
 *
 * A file moves, the prose does not, and a reader — or an agent — follows the old path,
 * finds nothing, and invents the rest.
 *
 * More from the same module when you want them: `docSymbols` (a renamed class leaves
 * its old name in prose), `docCounts` ("seven services" in a document describing nine),
 * `docHygiene`, `docPlacement`.
 */
import { docPaths } from '@specwarden/docs';

export const check = docPaths({
  id: 'doc-paths',
  title: 'paths named in documentation exist',
  tier: 'fast',
  docs: '**/*.md',
});
