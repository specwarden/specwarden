import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { inScratchRepository, planted, provePlayground } from '../../../scripts/playground-proof.mjs';

/**
 * `init --template speckit` over a sign-in service specified with Spec Kit: a constitution,
 * two features each with a spec and tasks, the code, and its tests.
 *
 * Two features that both number their requirements from FR-001 are deliberate. Spec Kit
 * numbers per feature, and a reader that keyed requirements by number alone would fold two
 * requirements into one without a word — so the reconciliation below counts them.
 */

const read = (rel: string): string => readFileSync(new URL(`repository/${rel}`, import.meta.url), 'utf8');

/** Assembled at run time, so no credential-shaped literal sits in this repository. */
const leakedKey = `AKIA${'P6ZN3WQ8RT5LXM2K'}`;

provePlayground(
  'speckit',
  {
    'doc-paths': {
      why: 'the README pointing at a test file that was never written',
      edits: {
        'README.md': planted(read('README.md'), '`test/magic-link.test.ts`', '`test/sessions.test.ts`'),
      },
      says: 'test/sessions.test.ts',
    },
    'secret-scan': {
      why: 'a mail provider key committed beside the link issuer',
      edits: { 'src/mailer.ts': `export const mailer = { accessKeyId: '${leakedKey}' };\n` },
      says: 'src/mailer.ts',
    },
    unit: {
      why: 'a link that no longer expires — FR-002 broken, and the suite says so',
      edits: {
        'src/magic-link.ts': planted(
          read('src/magic-link.ts'),
          "  if (now - issuedAt > FIFTEEN_MINUTES) return 'this link is older than fifteen minutes';\n",
          '',
        ),
      },
      says: 'npm test',
    },
  },
  { describe, it, expect, beforeAll, afterAll },
);

describe('sync-invariants over the Spec Kit tree the template wired', () => {
  const requirements = ['001-magic-links', '002-session-expiry'].flatMap((feature) =>
    read(`specs/${feature}/spec.md`)
      .split('\n')
      .filter((l) => /^\s*-\s*\*\*FR-\d+\*\*/.test(l)),
  );

  it('reads every requirement of every feature — two FR-001s stay two', () => {
    const run = inScratchRepository('speckit', {}, ({ specwarden }) => specwarden(['sync-invariants']));

    expect(run.status).toBe(0);
    expect(run.stdout).toContain(`speckit: ${requirements.length} requirement(s), 0 invariant(s) found`);
    expect(run.stdout).toContain('+ 001-magic-links#FR-001');
    expect(run.stdout).toContain('+ 002-session-expiry#FR-001');
  }, 60_000);

  it('says it found nothing — not "in sync" — when there is no specs directory', () => {
    const run = inScratchRepository('speckit', { edits: { specs: null } }, ({ specwarden }) =>
      specwarden(['sync-invariants']),
    );

    expect(run.stdout).toContain('found nothing');
    expect(run.stdout).not.toContain('in sync');
  }, 60_000);
});
