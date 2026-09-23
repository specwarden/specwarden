import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { provePlayground } from '../../../scripts/playground-proof.mjs';

/**
 * `init --template docs-only` over a handbook — onboarding, runbooks, decisions — and the
 * two checks it switches on, each shown failing on the defect it exists for.
 *
 * The handbook is the case the template's own docblock argues from: a repository whose
 * product IS its documents, where a path that stops resolving is a runbook nobody can find
 * during the incident that needed it. The two `.example` checks stay off — counts and
 * placement need facts only this repository has — and are imported by the template's unit
 * suite instead, which is where a broken example is caught.
 */
provePlayground(
  'docs-only',
  {
    'doc-paths': {
      why: 'an onboarding page naming a runbook that was renamed',
      edits: {
        'docs/onboarding/first-week.md': [
          '# Your first week',
          '',
          '1. Pair on one runbook step. `docs/runbooks/drain-the-consumer.md` is the usual first',
          '   one: short, safe, and needed every week.',
          '',
        ].join('\n'),
      },
      says: 'docs/runbooks/drain-the-consumer.md',
    },
    'doc-hygiene': {
      why: 'a runbook index linking to a page that was never written',
      edits: {
        'docs/runbooks/README.md': [
          '# Runbooks',
          '',
          '- [Restart the queue](./restart-the-queue.md)',
          '- [Escalate an incident](./escalate-an-incident.md)',
          '',
        ].join('\n'),
      },
      says: './escalate-an-incident.md',
    },
  },
  { describe, it, expect, beforeAll, afterAll },
);
