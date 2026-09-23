import { describe, expect, it } from 'vitest';

import { type IVerdict, errorsOf, runCheck } from 'specwarden';
import { hostOf, parseUpstreams, upstreamsResolve, violationsFor } from './upstreams-resolve.check';

/**
 * Both directions are cases, because both happen: a service name in the host-mode file, and
 * a loopback address in a deployed one.
 * Each is a 502 on a page that never opened, from a config that loads cleanly.
 */
const OPTIONS = {
  hostModes: ['local'],
  loopbackHosts: ['localhost', '127.0.0.1', '[::1]'],
  fileFor: (mode: string) => `caddy/Caddyfile.${mode}`,
};

describe('parseUpstreams', () => {
  it('finds every upstream and ignores a commented directive', () => {
    const source = [
      'route {',
      '  reverse_proxy api:3000',
      '  # reverse_proxy old:3000',
      '  reverse_proxy localhost:5173',
      '}',
    ].join('\n');

    expect(parseUpstreams(source)).toEqual([
      { upstream: 'api:3000', line: 2 },
      { upstream: 'localhost:5173', line: 4 },
    ]);
  });

  it('skips the block form rather than guessing at it', () => {
    expect(parseUpstreams('reverse_proxy {\n  to api:3000\n}')).toEqual([]);
  });
});

describe('hostOf', () => {
  it('strips a scheme and a port', () => {
    expect(hostOf('http://127.0.0.1:3000')).toBe('127.0.0.1');
    expect(hostOf('api:3000')).toBe('api');
  });

  /**
   * A kept path suffix makes a loopback address compare as a service name, so the check
   * reports the exact opposite of the truth — and no config in a small repository uses
   * one, so nothing but this case would notice it going.
   */
  it('strips a path, and strips it before the port', () => {
    expect(hostOf('localhost:3000/api')).toBe('localhost');
    expect(hostOf('http://127.0.0.1:8080/health')).toBe('127.0.0.1');
    expect(hostOf('api:3000/v1')).toBe('api');
  });
});

describe('violationsFor', () => {
  it('fails a container service name in a host-mode file, naming file and line', () => {
    const problems = violationsFor('local', [{ upstream: 'api:3000', line: 7 }], OPTIONS);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('caddy/Caddyfile.local:7');
    expect(problems[0]).toContain('runs on the HOST');
  });

  it('passes a loopback upstream in a host-mode file', () => {
    expect(violationsFor('local', [{ upstream: 'localhost:3000', line: 1 }], OPTIONS)).toEqual([]);
  });

  it('catches the mirror image: a loopback address in a deployed file', () => {
    const problems = violationsFor('prod', [{ upstream: 'localhost:3000', line: 3 }], OPTIONS);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('INSIDE the container network');
  });

  it('counts 127.0.0.1 and a scheme-qualified upstream as loopback', () => {
    expect(violationsFor('local', [{ upstream: 'http://127.0.0.1:3000', line: 1 }], OPTIONS)).toEqual([]);
  });

  /** `{$VAR}` resolves from an environment this check cannot see; a guess is a finding
   * nobody can act on. */
  it('leaves an interpolated upstream alone', () => {
    expect(violationsFor('prod', [{ upstream: '{$UPSTREAM}', line: 1 }], OPTIONS)).toEqual([]);
  });
});

describe('upstreamsResolve', () => {
  const check = upstreamsResolve({
    id: 'caddy-upstreams',
    title: 'upstreams resolve',
    modes: ['local', 'prod'],
    ...OPTIONS,
    when: () => true,
  });

  const runOver = (tree: Record<string, string>): Promise<IVerdict> => runCheck(check, { tree });

  it('is a product-zone, read-only check', () => {
    expect(check).toMatchObject({ zone: 'product', capabilities: ['read'], tier: 'fast' });
  });

  it('passes when each mode names what resolves for it, and says so', async () => {
    const verdict = await runOver({
      'caddy/Caddyfile.local': 'reverse_proxy localhost:3000\n',
      'caddy/Caddyfile.prod': 'reverse_proxy api:3000\n',
    });

    expect(verdict).toEqual({
      ok: true,
      findings: [{ severity: 'info', message: '✓ every upstream resolves where its proxy runs' }],
    });
  });

  it('fails each wrong upstream, in each mode, with its file and line', async () => {
    const verdict = await runOver({
      'caddy/Caddyfile.local': 'reverse_proxy api:3000\n',
      'caddy/Caddyfile.prod': '\nreverse_proxy localhost:3000\n',
    });

    expect(errorsOf(verdict).map((m) => m.split(' ')[0])).toEqual([
      'caddy/Caddyfile.local:1',
      'caddy/Caddyfile.prod:2',
    ]);
  });

  it('reports a mode whose file is absent as skipped, not as a pass', async () => {
    const verdict = await runOver({ 'caddy/Caddyfile.local': 'reverse_proxy localhost:3000\n' });

    expect(errorsOf(verdict)).toEqual([]);
    expect(verdict.findings).toEqual([
      { severity: 'info', message: 'SKIPPED prod: caddy/Caddyfile.prod not present.' },
    ]);
  });

  /**
   * The honest "cannot tell", and the one state where this check examines nothing: it is
   * green, but it prints no ✓ — only what it skipped, so nobody reads it as verified.
   */
  it('with EVERY file absent, fails naming them — it was a green run of SKIPPED lines', async () => {
    // "Every file missing" is `fileFor` pointed at the wrong place, not a repository with
    // no proxy: a repository with no proxy does not wire this check.
    const verdict = await runOver({});

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)).toEqual([
      'none of the proxy configs `fileFor` names exists (caddy/Caddyfile.local, caddy/Caddyfile.prod) — this check examined nothing, and a check that examined nothing cannot fail. Point `fileFor` at where they are.',
    ]);
  });

  it('with SOME files absent, reads the rest and notes each one it skipped', async () => {
    const verdict = await runOver({ 'caddy/Caddyfile.prod': 'reverse_proxy api:3000\n' });

    expect(verdict.ok).toBe(true);
    expect(verdict.findings.map((f) => f.message)).toEqual(['SKIPPED local: caddy/Caddyfile.local not present.']);
  });

  /** A file whose upstreams stopped being found is a check reporting success about
   * nothing — louder than a silent pass, and the whole reason this branch exists. */
  it('fails a file with no upstream at all rather than passing quietly', async () => {
    const verdict = await runOver({
      'caddy/Caddyfile.local': 'respond "hi"\n',
      'caddy/Caddyfile.prod': 'reverse_proxy api:3000\n',
    });

    expect(errorsOf(verdict)[0]).toContain('no reverse_proxy upstream this check can see');
  });
});
