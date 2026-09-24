// `doc-paths` — every repository-relative path named in documentation resolves.
// A file moves, the prose does not, and a reader follows the old path to nothing.
// `docs` is what is read; `except` leaves out a tree whose paths are history.
import { docPaths } from '@specwarden/docs';

export const check = docPaths({
  docs: '**/*.md',
  rule: 'Every repository-relative path named in documentation exists.',
});
