import { describe, expect, it } from 'vitest';

import { BUILT_IN_SECRET_PATTERNS, secretScan } from '@specwarden/security';
import { errorsOf, publishedFactories, runCheck, uncoveredFactories } from 'specwarden';

/**
 * Everything this package publishes, wired the way a consumer wires it.
 *
 * A unit suite imports a unit by PATH and keeps passing over a package whose factory was
 * renamed and never re-exported from the barrel. This imports `@specwarden/security` by
 * NAME, so it fails where the consumer would.
 *
 * Every check runs TWICE — over a clean tree and a tree carrying a credential. A check
 * returning the same verdict for both cannot fail, and one that cannot fail reports
 * success.
 */

const ID = { id: 'secret-scan', title: 'playground', tier: 'fast' as const };

/** A repository with nothing credential-shaped in it. */
const CLEAN = {
  'README.md': '# clean\n\nConfiguration is read from the environment.\n',
  '.env.example': 'API_TOKEN=\nDATABASE_URL=\n',
};

/**
 * The same repository with a credential in it.
 *
 * An AWS access key id, because it is the shape with the least ambiguity in the shipped
 * library: a fixed prefix and a fixed length. A fixture built on an entropy heuristic
 * would be testing the heuristic rather than the scan.
 *
 * Assembled rather than written out, so this file does not itself trip a credential scan
 * run over THIS repository — the one file that necessarily contains the pattern is the
 * one the allowlist exists for, and needing an allowlist entry for a fixture is a smell
 * worth avoiding.
 */
const KEY = `AKIA${'ABCDEFGHIJ012345'}`;

const LEAKED = {
  ...CLEAN,
  'src/config.ts': `export const key = '${KEY}';\n`,
};

describe('@specwarden/security', () => {
  it('exercises every check factory the package publishes', async () => {
    // `COVERED` is a claim, and a claim nothing checks goes stale the first time
    // somebody adds a factory. This reads the barrel instead, so an uncovered export
    // fails here rather than shipping untested.
    const mod = (await import('@specwarden/security')) as Record<string, unknown>;

    const probe = { ...ID, allowlist: [] };
    expect(uncoveredFactories(mod, { covered: ['secretScan'], probe })).toEqual([]);
    // And the probe is one the factory accepts: it refuses an option it does not have, so a
    // probe it refused would read it as a helper and the line above would pass over nothing.
    expect(publishedFactories(mod, probe)).toEqual(['secretScan']);
  });

  it('ships a pattern library, and it is not empty', () => {
    // A scan configured with no patterns finds nothing and reports green — the exact
    // shape this product exists against, one layer down.
    expect(BUILT_IN_SECRET_PATTERNS.length).toBeGreaterThan(0);
  });

  it('passes a repository with no credential in it', async () => {
    const verdict = await runCheck(secretScan({ ...ID, ratchet: 0 }), { tree: CLEAN, tracked: Object.keys(CLEAN) });

    expect(verdict.ok).toBe(true);
  });

  it('fails a repository carrying one, and names the file', async () => {
    const verdict = await runCheck(secretScan({ ...ID, ratchet: 0 }), { tree: LEAKED, tracked: Object.keys(LEAKED) });

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict).join(' ')).toContain('src/config.ts');
  });

  it('the allowlist is for a file that NECESSARILY contains the pattern', async () => {
    // A document about credential formats, a fixture, the pattern library itself. Not
    // for a secret nobody has rotated yet: that is not an allowlist entry, it is an
    // incident.
    const check = secretScan({ ...ID, ratchet: 0, allowlist: [{ file: 'src/config.ts', patternId: '*' }] });

    expect((await runCheck(check, { tree: LEAKED, tracked: Object.keys(LEAKED) })).ok).toBe(true);
  });

  it('the ratchet tolerates the debt that exists and fails the next one', async () => {
    const armed = secretScan({ ...ID, ratchet: 1 });

    expect((await runCheck(armed, { tree: LEAKED, tracked: Object.keys(LEAKED) })).ok).toBe(true);

    const second = { ...LEAKED, 'src/other.ts': `export const k = '${`ASIA${'ZYXWVUTSRQ987654'}`}';\n` };
    expect((await runCheck(armed, { tree: second, tracked: Object.keys(second) })).ok).toBe(false);
  });
});

// Wired with no `rule`, a module's check was an orphan the moment a register existed —
// and a preset's checks had nowhere to put one. The module knows what its check enforces.
describe('@specwarden/security — every check names the rule it enforces', () => {
  it('carries an implied rule owned by the package, and a rule the consumer writes wins', () => {
    const built = [secretScan({ id: 'secret-scan' })];
    for (const check of built) {
      expect(check.rule, check.id).toEqual(
        expect.objectContaining({ statement: expect.any(String), owner: '@specwarden/security', implied: true }),
      );
      expect(check.title, check.id).not.toBe(check.id);
    }
    expect(secretScan({ id: 'secret-scan', rule: 'ours' }).rule).toEqual({ statement: 'ours' });
  });
});
