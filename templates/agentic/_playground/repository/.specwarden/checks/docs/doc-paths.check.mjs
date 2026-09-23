// `doc-paths` — every repository-relative path named in documentation resolves.
// An agent follows a dead path, finds nothing, and INVENTS the rest — confidently, in a diff.
// `docs` is what is read; `skipDirs` leaves out a tree whose paths are history.
import { docPaths } from '@specwarden/docs';

export const check = docPaths({
  docs: '**/*.md',
  skipDirs: ['docs/_plans-archive/'],
  rule: 'Every repository-relative path named in documentation exists.',
});
