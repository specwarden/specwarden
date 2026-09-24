import { describe, expect, it } from 'vitest';

import { CheckOptionsError, errorsOf, runCheck } from 'specwarden';
import { DEFAULT_LOOPBACK_HOSTS, proxyUpstreams } from './proxy-upstreams.check';

const OPTIONS = {
  modes: ['local', 'prod'],
  fileFor: (mode: string) => `caddy/Caddyfile.${mode}`,
  hostModes: ['local'],
};

describe('proxyUpstreams — its defaults and its options', () => {
  it('knows the names every machine gives itself, when none are said', async () => {
    const tree = {
      'caddy/Caddyfile.local': 'reverse_proxy [::1]:3000\nreverse_proxy 127.0.0.1:3001\n',
      'caddy/Caddyfile.prod': 'reverse_proxy localhost:3000\n',
    };
    const check = proxyUpstreams(OPTIONS);

    expect(DEFAULT_LOOPBACK_HOSTS).toEqual(['localhost', '127.0.0.1', '[::1]']);
    expect(check.tier).toBe('fast');
    expect(check.when(['anything'])).toBe(true);
    expect(errorsOf(await runCheck(check, { tree }))).toEqual([
      'caddy/Caddyfile.prod:1 proxies to `localhost:3000`. The proxy runs INSIDE the container network in prod mode, so a loopback address is the proxy itself — the site answers 502 on a public host. Use the service name.',
    ]);
  });

  it('refuses a file map that is not a function, and an option it does not have', () => {
    expect(() => proxyUpstreams({ ...OPTIONS, fileFor: 'caddy/Caddyfile' } as never)).toThrow(
      '`fileFor` must be a function',
    );
    expect(() => proxyUpstreams({ ...OPTIONS, loopback: [] } as never)).toThrow(CheckOptionsError);
  });

  it('refuses an empty `modes` and an empty `loopbackHosts`; an empty `hostModes` is a fact', () => {
    // `modes: []` read no file and passed.
    expect(() => proxyUpstreams({ ...OPTIONS, modes: [] })).toThrow('`modes` is empty');
    expect(() => proxyUpstreams({ ...OPTIONS, loopbackHosts: [] })).toThrow('`loopbackHosts` is empty');
    expect(proxyUpstreams({ ...OPTIONS, hostModes: [] }).id).toBe('proxy-upstreams');
  });

  it('carries the rule the package implies, and refuses `zone`', () => {
    expect(proxyUpstreams(OPTIONS).rule).toMatchObject({ owner: '@specwarden/ops', implied: true });
    expect(() => proxyUpstreams({ ...OPTIONS, zone: 'consumer' } as never)).toThrow('`zone` is not an option');
  });
});
