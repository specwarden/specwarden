import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { inScratchRepository, planted, provePlayground } from '../../../scripts/playground-proof.mjs';

/**
 * `init --template openspec` over a shop specified in OpenSpec: two capabilities with
 * requirements and scenarios, a change in flight with its tasks, and the code that follows.
 *
 * The template's distinctive part is not a check. It wires the SPEC SOURCE, which
 * `sync-invariants` reads — so beyond the proof every template gets, this runs the
 * reconciliation over the real tree, which nothing did before: the command had no test
 * at all, and it printed "✓ in sync" over a source holding no requirements.
 */

const read = (rel: string): string => readFileSync(new URL(`repository/${rel}`, import.meta.url), 'utf8');

/** Assembled at run time, so no credential-shaped literal sits in this repository. */
const leakedKey = `AKIA${'M8QT2RX6ZP4WLK3N'}`;

provePlayground(
  'openspec',
  {
    'doc-paths': {
      why: 'a change proposal naming a module that does not exist',
      edits: {
        'openspec/changes/add-gift-cards/proposal.md': planted(
          read('openspec/changes/add-gift-cards/proposal.md'),
          '- A gift card is a payment method with a balance.',
          '- A gift card is a payment method with a balance, beside `src/payments.ts`.',
        ),
      },
      says: 'src/payments.ts',
    },
    'secret-scan': {
      why: 'a payment provider key committed with the checkout code',
      edits: { 'src/provider.ts': `export const provider = { key: '${leakedKey}' };\n` },
      says: 'src/provider.ts',
    },
  },
  { describe, it, expect, beforeAll, afterAll },
);

describe('sync-invariants over the OpenSpec tree the template wired', () => {
  /** What the repository specifies, counted from the files rather than typed here. */
  const requirements = ['checkout', 'refunds'].flatMap((capability) =>
    read(`openspec/specs/${capability}/spec.md`)
      .split('\n')
      .filter((l) => /^###\s+Requirement:/.test(l)),
  );

  it('reads every requirement and proposes each for deposit, writing nothing', () => {
    const run = inScratchRepository('openspec', {}, ({ warden }) => warden(['sync-invariants']));

    expect(requirements.length).toBeGreaterThan(0);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain(`openspec: ${requirements.length} requirement(s), 0 invariant(s) found`);
    expect(run.stdout).toContain('+ refunds#the-system-shall-allow-a-refund-of-part-of-an-order');
    expect(run.stdout).toContain('Nothing was written');
  }, 60_000);

  it('says it found nothing — not "in sync" — when the specs directory is gone', () => {
    const run = inScratchRepository('openspec', { edits: { 'openspec/specs': null } }, ({ warden }) =>
      warden(['sync-invariants']),
    );

    expect(run.stdout).toContain('found nothing');
    expect(run.stdout).not.toContain('in sync');
  }, 60_000);

  it('says it holds no requirements — not "in sync" — when the headings are worded another way', () => {
    // A fork of OpenSpec that writes `### Req:` is found and read, and yields nothing. It
    // printed "✓ in sync" until this scene existed.
    const reworded = (rel: string) => read(rel).replaceAll('### Requirement:', '### Req:');
    const run = inScratchRepository(
      'openspec',
      {
        edits: {
          'openspec/specs/checkout/spec.md': reworded('openspec/specs/checkout/spec.md'),
          'openspec/specs/refunds/spec.md': reworded('openspec/specs/refunds/spec.md'),
        },
      },
      ({ warden }) => warden(['sync-invariants']),
    );

    expect(run.stdout).toContain('holds no requirements');
    expect(run.stdout).not.toContain('in sync —');
  }, 60_000);
});
