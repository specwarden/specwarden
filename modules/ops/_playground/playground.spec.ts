import { describe, expect, it } from 'vitest';

import { buildOrder, ciCoverage, envPairing, opsChecks, proxyUpstreams, shellScope } from '@specwarden/ops';
import { CheckOptionsError, type ICheck, errorsOf, publishedFactories, runCheck, uncoveredFactories } from 'specwarden';

import { BROKEN, CHECKS, CLEAN, COVERED, PROBE } from './repository';

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
 *
 * No `id`, no `title`, no `tier`, no `when`: each has a default, and the wiring below is
 * the minimal one the GUIDE shows. A check wired without a `when` — as this package's own
 * skill once did — crashed every run that filtered by relevance.
 */

const TRACKED = Object.keys(CLEAN);

/** Each factory, wired with only the facts it cannot default. */
const WIRED: Readonly<Record<string, () => ICheck>> = {
  envPairing: () =>
    envPairing({
      composeFile: 'docker-compose.yml',
      modes: ['prod'],
      verifierService: 'api',
      declaredKeys: () => new Set(['EDGE_SECRET']),
    }),
  proxyUpstreams: () =>
    proxyUpstreams({ modes: ['local', 'prod'], fileFor: (mode) => `caddy/Caddyfile.${mode}`, hostModes: ['local'] }),
  ciCoverage: () =>
    ciCoverage({ workflowFile: '.github/workflows/ci.yml', requiredJob: 'ci-ok', checks: () => CHECKS }),
  buildOrder: () =>
    buildOrder({
      packagesDir: 'packages',
      scopePrefix: '@org/',
      containerFiles: '*Dockerfile*',
      buildInvocation: /--filter\s+(@org\/[a-z0-9-]+)\s+run\s+build/,
    }),
  shellScope: () => shellScope(),
};

/** What the broken repository's one defect says, per check. */
const DEFECT: Readonly<Record<string, string>> = {
  'env-pairing': 'EDGE_SECRET is set in .env.prod (sent by edge) but missing or empty in api/.env.prod',
  'proxy-upstreams': 'caddy/Caddyfile.local:1 proxies to `api:3000`',
  'ci-coverage': 'heavy check `web-unit` (web unit) has no job',
  'build-order': 'Dockerfile: builds @org/contracts before @org/i18n',
  'shell-scope': 'scripts/deploy.sh:4 `local target` is outside every function',
};

describe('@specwarden/ops', () => {
  it('exercises every check factory the package publishes', async () => {
    const mod = (await import('@specwarden/ops')) as Record<string, unknown>;

    expect(uncoveredFactories(mod, { covered: COVERED, probe: PROBE })).toEqual([]);
    // And no helper reads as a factory: the claim is exactly the package's factories.
    expect(publishedFactories(mod, PROBE)).toEqual([...COVERED].sort());
  });

  for (const [factory, wire] of Object.entries(WIRED)) {
    it(`${factory}: green over the clean repository, red over its one defect, named`, async () => {
      const check = wire();

      expect(errorsOf(await runCheck(check, { tree: CLEAN, tracked: TRACKED })), check.id).toEqual([]);
      const broken = await runCheck(check, { tree: BROKEN, tracked: TRACKED });
      expect(broken.ok, check.id).toBe(false);
      expect(errorsOf(broken).join('\n'), check.id).toContain(DEFECT[check.id]);
    });
  }

  it('opsChecks: the whole module in one call, each check red on its own defect and no other', async () => {
    const checks = opsChecks({
      envPairing: {
        composeFile: 'docker-compose.yml',
        modes: ['prod'],
        verifierService: 'api',
        declaredKeys: () => new Set(['EDGE_SECRET']),
      },
      proxyUpstreams: { modes: ['local', 'prod'], fileFor: (mode) => `caddy/Caddyfile.${mode}`, hostModes: ['local'] },
      ciCoverage: { workflowFile: '.github/workflows/ci.yml', requiredJob: 'ci-ok', checks: () => CHECKS },
      buildOrder: {
        packagesDir: 'packages',
        scopePrefix: '@org/',
        containerFiles: '*Dockerfile*',
        buildInvocation: /--filter\s+(@org\/[a-z0-9-]+)\s+run\s+build/,
      },
      shellScope: {},
    });

    expect(checks.map((c) => c.id)).toEqual([
      'env-pairing',
      'proxy-upstreams',
      'ci-coverage',
      'build-order',
      'shell-scope',
    ]);
    for (const check of checks) {
      expect((await runCheck(check, { tree: CLEAN, tracked: TRACKED })).ok, check.id).toBe(true);
      // One defect per check, and each check red on its own: a defect that lit up a
      // neighbour too would be two checks that overlap.
      for (const other of checks) {
        const tree = { ...CLEAN, ...defectOf(other.id) };
        expect((await runCheck(check, { tree, tracked: TRACKED })).ok, `${check.id} over ${other.id}'s defect`).toBe(
          check.id !== other.id,
        );
      }
    }
  });

  it('every check refuses an empty corpus rather than passing over it — the files it reads moved', async () => {
    for (const wire of Object.values(WIRED)) {
      const check = wire();
      const tree = Object.fromEntries(Object.entries(CLEAN).filter(([path]) => !CORPUS[check.id]?.includes(path)));
      const verdict = await runCheck(check, { tree, tracked: Object.keys(tree) });

      expect(verdict.ok, check.id).toBe(false);
      expect(errorsOf(verdict)[0], check.id).toMatch(/^examined 0 .*below the floor of 1\./);
    }
  });

  it('refuses a misspelled, an empty or a wrong-kind option by name, when the file loads', () => {
    expect(() => shellScope({ pathspecs: ['a.sh'] } as never)).toThrow('`pathspecs` is not an option of shellScope');
    expect(() =>
      envPairing({ composeFile: 'c.yml', modes: [], verifierService: 'api', declaredKeys: () => new Set() }),
    ).toThrow('`modes` is empty');
    expect(() =>
      envPairing({ composeFile: 'c.yml', modes: ['prod'], verifierService: '', declaredKeys: () => new Set() }),
    ).toThrow('`verifierService` is empty');
    expect(() => ciCoverage({ workflowFile: 'ci.yml', arbiterJob: 'ci-ok' } as never)).toThrow(
      '`arbiterJob` is not an option of ciCoverage; `requiredJob` is required',
    );
    expect(() =>
      buildOrder({ packagesDir: 'p', scopePrefix: '@o/', containerFiles: 'D', buildInvocation: 'x' } as never),
    ).toThrow('`buildInvocation` must be a RegExp');
    expect(() => proxyUpstreams({ modes: ['p'], fileFor: 'Caddyfile', hostModes: [] } as never)).toThrow(
      CheckOptionsError,
    );
  });
});

/** What each check reads — the files whose absence is an empty corpus. */
const CORPUS: Readonly<Record<string, readonly string[]>> = {
  'env-pairing': ['docker-compose.yml'],
  'proxy-upstreams': ['caddy/Caddyfile.local', 'caddy/Caddyfile.prod'],
  'ci-coverage': ['.github/workflows/ci.yml'],
  'build-order': ['Dockerfile'],
  'shell-scope': ['scripts/deploy.sh'],
};

/** The broken repository's defect for one check, laid over the clean one. */
function defectOf(id: string): Record<string, string> {
  const file = {
    'env-pairing': 'api/.env.prod',
    'proxy-upstreams': 'caddy/Caddyfile.local',
    'ci-coverage': '.github/workflows/ci.yml',
    'build-order': 'Dockerfile',
    'shell-scope': 'scripts/deploy.sh',
  }[id] as string;
  return { [file]: BROKEN[file] as string };
}

// Wired with no `rule`, a module's check was an orphan the moment a register existed —
// and a preset's checks had nowhere to put one. The module knows what its check enforces.
describe('@specwarden/ops — every check names the rule it enforces', () => {
  it('carries an implied rule owned by the package, and a rule the consumer writes wins', () => {
    for (const wire of Object.values(WIRED)) {
      const check = wire();
      expect(check.rule, check.id).toEqual(
        expect.objectContaining({ statement: expect.any(String), owner: '@specwarden/ops', implied: true }),
      );
      expect(check.title, check.id).not.toBe(check.id);
      expect(check.zone, check.id).toBe('product');
    }
    expect(shellScope({ rule: 'ours' }).rule).toEqual({ statement: 'ours' });
  });

  it('is named for its subject, in kebab case, unless the consumer names it', () => {
    expect(Object.values(WIRED).map((wire) => wire().id)).toEqual([
      'env-pairing',
      'proxy-upstreams',
      'ci-coverage',
      'build-order',
      'shell-scope',
    ]);
    expect(shellScope({ id: 'deploy-scripts' }).id).toBe('deploy-scripts');
  });
});
