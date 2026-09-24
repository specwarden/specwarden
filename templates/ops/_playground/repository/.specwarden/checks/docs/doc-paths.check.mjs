// `doc-paths` — every repository-relative path named in documentation resolves.
// A runbook is read under pressure; a path in it that no longer resolves costs minutes when there are none.
// `docs` is what is read; `except` leaves out a tree whose paths are history.
import { docPaths } from '@specwarden/docs';

export const check = docPaths({
  docs: '**/*.md',
  rule: 'Every repository-relative path named in documentation exists.',
});
