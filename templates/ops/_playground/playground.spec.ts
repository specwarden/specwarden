import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { planted, provePlayground } from '../../../scripts/playground-proof.mjs';

/**
 * `init --template ops` over an infrastructure repository: a compose stack behind nginx,
 * deploy and backup scripts, runbooks, a deploy workflow.
 *
 * Each of those is a detection the template makes, and the empty repository this replaced
 * made none of them. With no tracked shell there was no `shell-local-scope`; with no
 * compose file and no workflow, the env-file and gate-coverage examples were never
 * written. Three of the template's six parts had never appeared in any tree.
 *
 * The three examples stay off here, as they do for a consumer — each needs a fact only
 * the repository has — and are imported by the template's unit suite instead.
 */

const read = (rel: string): string => readFileSync(new URL(`repository/${rel}`, import.meta.url), 'utf8');

/** Assembled at run time, so no credential-shaped literal sits in this repository. */
const leakedKey = `AKIA${'W3RT8ZL5QM2XNK7P'}`;

provePlayground(
  'ops',
  {
    'secret-scan': {
      why: 'an access key hard-coded into the backup script "just for tonight"',
      edits: {
        'scripts/backup.sh': planted(read('scripts/backup.sh'), 'backup\n', `AWS_ACCESS_KEY_ID=${leakedKey} backup\n`),
      },
      says: 'scripts/backup.sh',
    },
    'shell-local-scope': {
      // Bash refuses `local` outside a function at RUN time — so this is a backup that
      // fails at three in the morning, not a lint nobody reads.
      why: '`local` in the main body of a script, outside any function',
      edits: {
        'scripts/backup.sh': planted(read('scripts/backup.sh'), 'backup\n', 'local retries=3\nbackup\n'),
      },
      says: 'scripts/backup.sh',
    },
    'doc-paths': {
      why: 'a runbook naming a restore script nobody wrote',
      edits: {
        'docs/runbooks/restore-a-backup.md': planted(
          read('docs/runbooks/restore-a-backup.md'),
          '2. Restore the dump,',
          '2. Run `scripts/restore.sh` to restore the dump,',
        ),
      },
      says: 'scripts/restore.sh',
    },
  },
  { describe, it, expect, beforeAll, afterAll },
);
