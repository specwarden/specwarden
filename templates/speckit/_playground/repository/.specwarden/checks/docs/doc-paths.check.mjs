// `doc-paths` — every repository-relative path named in documentation resolves.
// A feature's plan citing a file that has moved is read as current by whoever implements it next.
// `docs` is what is read; `skipDirs` leaves out a tree whose paths are history.
import { docPaths } from '@specwarden/docs';

export const check = docPaths({
  docs: '**/*.md',
  rule: 'Every repository-relative path named in documentation exists.',
});
