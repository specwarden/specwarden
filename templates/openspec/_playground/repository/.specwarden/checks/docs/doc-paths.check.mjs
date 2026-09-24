// `doc-paths` — every repository-relative path named in documentation resolves.
// A change proposal citing a file that has moved is read as current by whoever picks it up next.
// `docs` is what is read; `except` leaves out a tree whose paths are history.
import { docPaths } from '@specwarden/docs';

export const check = docPaths({
  docs: '**/*.md',
  rule: 'Every repository-relative path named in documentation exists.',
});
