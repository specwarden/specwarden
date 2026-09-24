import { describe, expect, it } from 'vitest';

import { CheckOptionsError, errorsOf, runCheck } from 'specwarden';
import { type IOpsChecksOptions, opsChecks } from './ops-checks.check';

/** The facts no preset can know, one entry per check. */
const FACTS: IOpsChecksOptions = {
  envPairing: {
    composeFile: 'docker-compose.yml',
    modes: ['prod'],
    verifierService: 'api',
    declaredKeys: () => new Set(['KEY']),
  },
  proxyUpstreams: { modes: ['prod'], fileFor: () => 'Caddyfile', hostModes: [] },
  ciCoverage: { workflowFile: '.github/workflows/ci.yml', requiredJob: 'ci-ok' },
  buildOrder: {
    packagesDir: 'packages',
    scopePrefix: '@org/',
    containerFiles: 'Dockerfile',
    buildInvocation: /--filter\s+(\S+)\s+run\s+build/,
  },
  shellScope: {},
};

describe('opsChecks — the module in one call', () => {
  it('returns the five checks, each with its own id, in the fast tier', () => {
    const checks = opsChecks(FACTS);

    expect(checks.map((c) => c.id)).toEqual([
      'env-pairing',
      'proxy-upstreams',
      'ci-coverage',
      'build-order',
      'shell-scope',
    ]);
    expect(new Set(checks.map((c) => c.tier))).toEqual(new Set(['fast']));
    for (const check of checks) expect(check.rule, check.id).toMatchObject({ owner: '@specwarden/ops', implied: true });
  });

  it('applies `tier` and `when` to every check it builds — and a check’s own wins', () => {
    const when = (changed: readonly string[]): boolean => changed.includes('deploy');
    const checks = opsChecks({ ...FACTS, tier: 'heavy', when, shellScope: { tier: 'fast' } });

    expect(checks.map((c) => c.tier)).toEqual(['heavy', 'heavy', 'heavy', 'heavy', 'fast']);
    for (const check of checks) {
      expect(check.when(['deploy']), check.id).toBe(true);
      expect(check.when(['src/a.ts']), check.id).toBe(false);
    }
  });

  it('leaves a check out only when told `false`, and takes `true` for the one with no facts', () => {
    const checks = opsChecks({
      envPairing: false,
      proxyUpstreams: false,
      ciCoverage: false,
      buildOrder: false,
      shellScope: true,
    });

    expect(checks.map((c) => c.id)).toEqual(['shell-scope']);
    expect(opsChecks({ ...FACTS, shellScope: false }).map((c) => c.id)).not.toContain('shell-scope');
  });

  it('refuses a check whose facts are missing, by name, saying how to leave it out', () => {
    expect(() => opsChecks({ ...FACTS, ciCoverage: undefined })).toThrow(CheckOptionsError);
    expect(() => opsChecks({ ...FACTS, ciCoverage: undefined })).toThrow(
      'opsChecks: pass `ciCoverage: { workflowFile, requiredJob }`, or `ciCoverage: false` to leave it out.',
    );
    expect(() => opsChecks()).toThrow('pass `envPairing: { composeFile, modes, verifierService, declaredKeys }`');
  });

  it('refuses an option it does not have, identity it cannot honour, and hands a check’s refusal through', () => {
    expect(() => opsChecks({ ...FACTS, shell: {} } as never)).toThrow('`shell` is not an option of opsChecks');
    // A preset is not a check: an `id` or a `rule` on it would name nothing.
    expect(() => opsChecks({ ...FACTS, id: 'ops' } as never)).toThrow('`id` is not an option of opsChecks');
    expect(() => opsChecks({ ...FACTS, shellScope: { pathspecs: [] } as never })).toThrow(
      '`pathspecs` is not an option of shellScope',
    );
  });

  it('builds checks that run: the shell check over a clean and a broken script', async () => {
    const [shell] = opsChecks({ envPairing: false, proxyUpstreams: false, ciCoverage: false, buildOrder: false });
    if (!shell) throw new Error('no check');

    expect(errorsOf(await runCheck(shell, { tree: { 'a.sh': 'f() {\n  local x\n}\n' } }))).toEqual([]);
    expect((await runCheck(shell, { tree: { 'a.sh': 'local x\n' } })).ok).toBe(false);
  });
});
