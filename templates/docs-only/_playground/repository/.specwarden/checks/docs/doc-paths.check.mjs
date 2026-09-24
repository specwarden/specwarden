// `doc-paths` — every repository-relative path named in documentation resolves.
// In a repository that IS documentation, a dead path is the difference between a handbook and a maze.
// `docs` is what is read; `except` leaves out a tree whose paths are history.
import { docPaths } from '@specwarden/docs';

export const check = docPaths({
  docs: '**/*.md',
  rule: 'Every repository-relative path named in documentation exists.',
});
