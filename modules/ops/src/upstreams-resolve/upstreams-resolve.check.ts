import { type ICheck, type IVerdict, buildCheck, checkOptions } from 'specwarden';
import type { IOpsCheckIdentity } from '../_shared/identity/identity.model';

/**
 * A reverse proxy points at a name that RESOLVES from where the proxy actually runs.
 *
 * THE DEFECT, and why it is invisible until it is public. The same proxy configuration is
 * written twice: once for a mode where the proxy runs on the HOST beside the services, and
 * once for a mode where it runs INSIDE the container network. `localhost:3000` and
 * `service:3000` are each correct in exactly one of those and a 502 in the other — and
 * neither spelling is a syntax error, so the config loads, the container starts healthy,
 * and the failure is a bad gateway on a page nobody opened yet.
 *
 * WHAT MAKES IT CHECKABLE. The mode is knowable from the file name, and where the proxy
 * runs in each mode is a fact the host states once. Everything after that is arithmetic:
 * a host-mode file may only name a loopback address, a container-mode file may only name
 * something else.
 *
 * AN INTERPOLATED UPSTREAM IS SKIPPED, not guessed at: `{$VAR}` resolves at load time from
 * an environment this check cannot see, and a guess either way would be a finding nobody
 * can act on.
 *
 * A FILE WITH NO UPSTREAMS FAILS. A scanner that stopped matching the directive would
 * otherwise report success about nothing — which is the failure mode the whole harness is
 * written against.
 */

export interface IUpstream {
  readonly upstream: string;
  readonly line: number;
}

export interface IUpstreamsResolveOptions extends IOpsCheckIdentity {
  /** The modes to check, and how each one's file is named: `(mode) => path`. */
  readonly modes: readonly string[];
  readonly fileFor: (mode: string) => string;
  /** Modes where the proxy runs on the HOST, beside the services rather than among them. */
  readonly hostModes: readonly string[];
  /** Addresses that mean "this machine" — a loopback name only a host mode may use.
   * Default: `DEFAULT_LOOPBACK_HOSTS`. */
  readonly loopbackHosts?: readonly string[];
}

/** The names every machine gives itself. A host with another alias for itself adds it. */
export const DEFAULT_LOOPBACK_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '[::1]'];

/** `reverse_proxy <upstream>` occurrences, with line numbers, comments skipped. */
export function parseUpstreams(source: string): IUpstream[] {
  const found: IUpstream[] = [];

  source.split('\n').forEach((raw, index) => {
    const line = raw.replace(/\r$/, '').trim();
    if (line.startsWith('#')) return;

    const match = /^reverse_proxy\s+(\S+)/.exec(line);
    if (!match) return;

    const upstream = match[1] as string;
    // `reverse_proxy {` — an upstream declared inside the block by `to`. Skipped rather
    // than guessed at; a host that uses the block form needs this widened deliberately.
    if (upstream === '{') return;

    found.push({ upstream, line: index + 1 });
  });

  return found;
}

/**
 * The host part of an upstream, with scheme, PATH and port removed.
 *
 * The path strip is not decoration: `localhost:3000/api` would otherwise keep its suffix,
 * fail to match a loopback name, and be classified as a container service — the check then
 * reports the opposite of the truth about the one upstream a reader would look at hardest.
 * Order matters too: the path goes before the port, or `:3000/api` leaves `3000/api` behind.
 */
export function hostOf(upstream: string): string {
  return upstream
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
}

export function violationsFor(
  mode: string,
  upstreams: readonly IUpstream[],
  options: {
    readonly hostModes: readonly string[];
    readonly loopbackHosts: readonly string[];
    readonly fileFor: (m: string) => string;
  },
): string[] {
  const runsOnHost = options.hostModes.includes(mode);
  const file = options.fileFor(mode);

  return upstreams
    .filter(({ upstream }) => !upstream.includes('{$'))
    .map(({ upstream, line }) => {
      const isLoopback = options.loopbackHosts.includes(hostOf(upstream));

      if (runsOnHost && !isLoopback) {
        return (
          `${file}:${line} proxies to \`${upstream}\`. The proxy runs on the HOST in ${mode} mode, ` +
          'where a container service name does not resolve — the page answers 502. Use the port ' +
          'the service publishes on this machine.'
        );
      }
      if (!runsOnHost && isLoopback) {
        return (
          `${file}:${line} proxies to \`${upstream}\`. The proxy runs INSIDE the container network ` +
          `in ${mode} mode, so a loopback address is the proxy itself — the site answers 502 on a ` +
          'public host. Use the service name.'
        );
      }
      return null;
    })
    .filter((failure): failure is string => failure !== null);
}

export function upstreamsResolve(options: IUpstreamsResolveOptions): ICheck {
  checkOptions('upstreamsResolve', options, {
    modes: { kind: 'array', required: true },
    fileFor: { kind: 'function', required: true },
    hostModes: { kind: 'array', required: true },
    loopbackHosts: { kind: 'array' },
  });
  const resolved = { ...options, loopbackHosts: options.loopbackHosts ?? DEFAULT_LOOPBACK_HOSTS };

  return buildCheck(
    {
      ...options,
      rule: options.rule ?? {
        statement: 'every upstream a proxy names is a service that exists in that mode',
        owner: '@specwarden/ops',
        implied: true,
      },
      tier: options.tier ?? 'fast',
      zone: 'product',
    },
    ['read'],
    (ctx): IVerdict => {
      const failures: string[] = [];
      const notes: string[] = [];

      for (const mode of options.modes) {
        const file = options.fileFor(mode);
        const source = ctx.files.tryRead(file);
        if (source === undefined) {
          notes.push(`SKIPPED ${mode}: ${file} not present.`);
          continue;
        }

        const upstreams = parseUpstreams(source);
        if (upstreams.length === 0) {
          failures.push(
            `${file} has no reverse_proxy upstream this check can see. Either the file stopped ` +
              'proxying (unlikely) or the scanner no longer matches the directive.',
          );
          continue;
        }

        failures.push(...violationsFor(mode, upstreams, resolved));
      }

      // EVERY file absent is not a repository without a proxy — it is `fileFor` pointed at
      // the wrong place, and it was a green run: one SKIPPED line per mode and exit 0. A
      // mode whose file is absent while another's is read stays a SKIPPED note.
      if (notes.length === options.modes.length) {
        failures.push(
          `none of the proxy configs \`fileFor\` names exists (${options.modes.map((m) => options.fileFor(m)).join(', ')}) — ` +
            'this check examined nothing, and a check that examined nothing cannot fail. Point `fileFor` at where they are.',
        );
      }

      const findings = [
        ...failures.map((message) => ({ severity: 'error' as const, message, ruleId: options.id })),
        ...notes.map((message) => ({ severity: 'info' as const, message })),
      ];

      if (failures.length === 0 && findings.length === 0) {
        findings.push({ severity: 'info', message: `✓ every upstream resolves where its proxy runs` });
      }

      return { ok: failures.length === 0, findings };
    },
  );
}
