import { describe, expect, it } from 'vitest';

import { InMemoryFileSource } from 'specwarden';
import { hostOf, parseUpstreams, upstreamsResolve, violationsFor } from './upstreams-resolve.check';

/**
 * Carried from the consumer check this replaced. Both directions are cases, because both
 * shipped: a service name in the host-mode file, and a loopback address in a deployed one.
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
      '  reverse_proxy be:3000',
      '  # reverse_proxy old:3000',
      '  reverse_proxy localhost:5173',
      '}',
    ].join('\n');

    expect(parseUpstreams(source)).toEqual([
      { upstream: 'be:3000', line: 2 },
      { upstream: 'localhost:5173', line: 4 },
    ]);
  });

  it('skips the block form rather than guessing at it', () => {
    expect(parseUpstreams('reverse_proxy {\n  to be:3000\n}')).toEqual([]);
  });
});

describe('hostOf', () => {
  it('strips a scheme and a port', () => {
    expect(hostOf('http://127.0.0.1:3000')).toBe('127.0.0.1');
    expect(hostOf('be:3000')).toBe('be');
  });

  /**
   * The path suffix had no test in the original and was briefly dropped in the move to the
   * engine — caught by review, not by a run, because no tracked config uses one today. A
   * kept suffix makes a loopback address compare as a service name, so the check reports
   * the exact opposite of the truth.
   */
  it('strips a path, and strips it before the port', () => {
    expect(hostOf('localhost:3000/api')).toBe('localhost');
    expect(hostOf('http://127.0.0.1:8080/health')).toBe('127.0.0.1');
    expect(hostOf('be:3000/api')).toBe('be');
  });
});

describe('violationsFor', () => {
  it('fails a container service name in a host-mode file, naming file and line', () => {
    const problems = violationsFor('local', [{ upstream: 'be:3000', line: 7 }], OPTIONS);

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

  const runOver = (files: Record<string, string>) => check.run({ files: new InMemoryFileSource(files, '') } as never);

  const errors = (verdict: { findings: readonly { severity: string; message: string }[] }) =>
    verdict.findings.filter((f) => f.severity === 'error').map((f) => f.message);

  it('passes when each mode names what resolves for it', () => {
    const verdict = runOver({
      'caddy/Caddyfile.local': 'reverse_proxy localhost:3000\n',
      'caddy/Caddyfile.prod': 'reverse_proxy be:3000\n',
    });

    expect(errors(verdict)).toEqual([]);
  });

  it('reports a mode whose file is absent as skipped, not as a pass', () => {
    const verdict = runOver({ 'caddy/Caddyfile.local': 'reverse_proxy localhost:3000\n' });

    expect(errors(verdict)).toEqual([]);
    expect(verdict.findings.some((f) => f.message.includes('SKIPPED prod'))).toBe(true);
  });

  /** A file whose upstreams stopped being found is a check reporting success about
   * nothing — louder than a silent pass, and the whole reason this branch exists. */
  it('fails a file with no upstream at all rather than passing quietly', () => {
    const verdict = runOver({
      'caddy/Caddyfile.local': 'respond "hi"\n',
      'caddy/Caddyfile.prod': 'reverse_proxy be:3000\n',
    });

    expect(errors(verdict)[0]).toContain('no reverse_proxy upstream this check can see');
  });
});
