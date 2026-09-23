import { describe, expect, it } from 'vitest';

import {
  buildOrderFollowsDeps,
  envFilesAgree,
  gatesHaveCiJobs,
  shellLocalScope,
  upstreamsResolve,
} from '@specwarden/ops';
import { errorsOf, runCheck, uncoveredFactories } from 'specwarden';

import { BROKEN, CLEAN, COVERED, GATES, PROBE } from './repository';

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

const ID = { title: 'playground', tier: 'fast' as const, when: () => true };

describe('@specwarden/ops', () => {
  it('exercises every check factory the package publishes', async () => {
    const mod = (await import('@specwarden/ops')) as Record<string, unknown>;

    expect(uncoveredFactories(mod, { covered: COVERED, probe: PROBE })).toEqual([]);
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
      loopbackHosts: ['localhost', '127.0.0.1'],
    });

    expect(errorsOf(await runCheck(check, { tree: CLEAN }))).toEqual([]);

    const verdict = await runCheck(check, { tree: BROKEN });
    expect(errorsOf(verdict).join(' ')).toContain('caddy/Caddyfile.local');
  });

  it('gatesHaveCiJobs: every heavy gate is run by a job the arbiter waits for', async () => {
    const check = gatesHaveCiJobs({
      ...ID,
      id: 'gate-coverage',
      workflow: '.github/workflows/ci.yml',
      arbiterJob: 'ci-ok',
      ciTier: 'heavy',
      cheapTier: 'fast',
      runnerPattern: String.raw`warden\.mjs\s+check`,
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
    const check = shellLocalScope({ ...ID, id: 'shell-local-scope', pathspecs: ['scripts/*.sh'] });
    const tracked = ['scripts/deploy.sh'];

    expect((await runCheck(check, { tree: CLEAN, tracked })).ok).toBe(true);

    const verdict = await runCheck(check, { tree: BROKEN, tracked });
    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict).join(' ')).toContain('scripts/deploy.sh');
  });
});
