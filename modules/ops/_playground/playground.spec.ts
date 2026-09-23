import { describe, expect, it } from 'vitest';

import {
  buildOrderFollowsDeps,
  envFilesAgree,
  gatesHaveCiJobs,
  shellLocalScope,
  upstreamsResolve,
} from '@specwarden/ops';
import { CheckOptionsError, errorsOf, runCheck } from 'specwarden';

import { BROKEN, CLEAN, COVERED, GATES } from './repository';

/**
 * Everything this package publishes, wired the way a consumer wires it, against one
 * repository in two states.
 *
 * WHY THIS IS NOT THE UNIT SUITE WITH MORE STEPS. A unit suite imports a unit by PATH and
 * hands it a duck-typed context, so it keeps passing over a package whose factory was
 * renamed and never re-exported from the barrel — and that is the first thing a consumer
 * meets. This imports `@specwarden/ops` by NAME, through the package's own `exports` map,
 * and runs each check through the engine's own context, so it fails where the consumer
 * would.
 *
 * Every check is run TWICE, over the same repository clean and broken. A check returning
 * the same verdict for both cannot fail, and one that cannot fail reports success.
 */

/**
 * No `when` and no `tier`: both are optional, and wiring a check without a `when` — as
 * this package's own skill did — crashed every run that filtered by relevance.
 */
const ID = { title: 'playground' };

const isCheck = (value: unknown): boolean =>
  typeof (value as { id?: unknown } | null)?.id === 'string' &&
  typeof (value as { run?: unknown } | null)?.run === 'function';

/**
 * Every export that builds a check, told from a helper by what it DOES with an options
 * object it cannot honour: it returns a check, or it refuses the options by name. One probe
 * carrying every factory's options read every factory as a helper once each began refusing
 * the options it does not have — an audit that passed over none of them.
 */
function factoriesOf(mod: Readonly<Record<string, unknown>>): string[] {
  return Object.entries(mod)
    .filter(([name, value]) => typeof value === 'function' && /^[a-z]/.test(name))
    .filter(([, value]) => {
      try {
        return isCheck((value as (options: unknown) => unknown)({ id: 'probe', unknownOption: true }));
      } catch (error) {
        return error instanceof CheckOptionsError;
      }
    })
    .map(([name]) => name)
    .sort();
}

describe('@specwarden/ops', () => {
  it('exercises every check factory the package publishes', async () => {
    const mod = (await import('@specwarden/ops')) as Record<string, unknown>;

    expect(factoriesOf(mod)).toEqual([...COVERED].sort());
  });

  it('a check wired with no `when` is relevant to every change, rather than a crash', () => {
    const check = shellLocalScope({ ...ID, id: 'shell-local-scope' });

    expect(check.when(['src/index.ts'])).toBe(true);
  });

  it('envFilesAgree: a key one service sends and another verifies is present in both', async () => {
    const check = envFilesAgree({
      ...ID,
      id: 'env-pairing',
      composeFile: 'docker-compose.yml',
      modes: ['prod'],
      verifierService: 'api',
      declaredKeys: () => new Set(['EDGE_SECRET']),
    });

    expect(errorsOf(await runCheck(check, { tree: CLEAN }))).toEqual([]);

    const verdict = await runCheck(check, { tree: BROKEN });
    expect(errorsOf(verdict).join(' ')).toContain('EDGE_SECRET');
  });

  it('upstreamsResolve: each mode names an address that resolves where its proxy runs', async () => {
    const check = upstreamsResolve({
      ...ID,
      id: 'caddy-upstreams',
      modes: ['local', 'prod'],
      fileFor: (mode) => `caddy/Caddyfile.${mode}`,
      hostModes: ['local'],
    });

    expect(errorsOf(await runCheck(check, { tree: CLEAN }))).toEqual([]);

    const verdict = await runCheck(check, { tree: BROKEN });
    expect(errorsOf(verdict).join(' ')).toContain('caddy/Caddyfile.local');
  });

  it('gatesHaveCiJobs: every heavy gate is run by a job the arbiter waits for', async () => {
    const check = gatesHaveCiJobs({
      ...ID,
      id: 'gate-coverage',
      // `heavy`, `fast` and the engine's own command are the defaults the workflow uses.
      workflow: '.github/workflows/ci.yml',
      arbiterJob: 'ci-ok',
      gates: () => GATES,
    });

    expect((await runCheck(check, { tree: CLEAN })).ok).toBe(true);

    const verdict = await runCheck(check, { tree: BROKEN });
    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict).join(' ')).toContain('web-unit');
  });

  it('buildOrderFollowsDeps: an image builds a package after the packages it imports', async () => {
    const check = buildOrderFollowsDeps({
      ...ID,
      id: 'workspace-build-order',
      packagesDir: 'packages',
      scopePrefix: '@org/',
      containerFiles: '*Dockerfile*',
      buildInvocation: String.raw`--filter\s+(@org\/[a-z0-9-]+)\s+run\s+build`,
    });

    expect((await runCheck(check, { tree: CLEAN, tracked: ['Dockerfile'] })).ok).toBe(true);

    const verdict = await runCheck(check, { tree: BROKEN, tracked: ['Dockerfile'] });
    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict).join(' ')).toContain('swap the two');
  });

  it('shellLocalScope: `local` appears only inside a function', async () => {
    const check = shellLocalScope({ ...ID, id: 'shell-local-scope' });
    const tracked = ['scripts/deploy.sh'];

    expect((await runCheck(check, { tree: CLEAN, tracked })).ok).toBe(true);

    const verdict = await runCheck(check, { tree: BROKEN, tracked });
    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict).join(' ')).toContain('scripts/deploy.sh');
  });
});

// Wired with no `rule`, a module's check was an orphan the moment a register existed —
// and a preset's checks had nowhere to put one. The module knows what its check enforces.
describe('@specwarden/ops — every check names the rule it enforces', () => {
  it('carries an implied rule owned by the package, and a rule the consumer writes wins', () => {
    const built = [shellLocalScope({ id: 'shell-local-scope' })];
    for (const check of built) {
      expect(check.rule, check.id).toEqual(
        expect.objectContaining({ statement: expect.any(String), owner: '@specwarden/ops', implied: true }),
      );
      expect(check.title, check.id).not.toBe(check.id);
    }
    expect(shellLocalScope({ id: 'shell-local-scope', rule: 'ours' }).rule).toEqual({ statement: 'ours' });
  });
});
