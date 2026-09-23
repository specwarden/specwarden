// `doc-paths` — every repository-relative path named in documentation resolves.
// Paths cross package boundaries here, and a package that moves takes every document naming it along.
// `docs` is what is read; `skipDirs` leaves out a tree whose paths are history.
import { docPaths } from '@specwarden/docs';

export const check = docPaths({
  docs: '**/*.md',
  rule: 'Every repository-relative path named in documentation exists.',
});
