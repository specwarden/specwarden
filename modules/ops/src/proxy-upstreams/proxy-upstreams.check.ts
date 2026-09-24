import {
  type ICheck,
  type ICorpusFloor,
  type IFinding,
  type IModuleCheckDeclaration,
  type IVerdict,
  belowCorpusFloor,
  buildCheck,
  checkOptions,
  thresholdOf,
  verdictFrom,
  withExaminedNote,
} from 'specwarden';
import { MODULE_OPTIONS, failure, note, opsIdentity } from '../_shared/identity/identity.util';

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
 * runs in each mode is a fact the consumer states once. Everything after that is arithmetic:
 * a host-mode file may only name a loopback address, a container-mode file may only name
 * something else.
 *
 * AN INTERPOLATED UPSTREAM IS SKIPPED, not guessed at: `{$VAR}` resolves at load time from
 * an environment this check cannot see, and a guess either way would be a finding nobody
 * can act on.
 *
 * A FILE WITH NO UPSTREAMS FAILS, and so does a run that read no file at all — the corpus
 * floor: a proxy config is committed, so every file absent is `fileFor` pointed at the
 * wrong place, not a repository without a proxy. It was a green run, one SKIPPED line per
 * mode and exit 0.
 */

export interface IUpstream {
  readonly upstream: string;
  readonly line: number;
}

export interface IProxyUpstreamsOptions extends IModuleCheckDeclaration {
  /** The modes to check, and how each one's file is named: `(mode) => path`. */
  readonly modes: readonly string[];
  readonly fileFor: (mode: string) => string;
  /** Modes where the proxy runs on the HOST, beside the services rather than among them.
   * `[]` when it always runs among them. */
  readonly hostModes: readonly string[];
  /** Addresses that mean "this machine" — a loopback name only a host mode may use.
   * Default: `DEFAULT_LOOPBACK_HOSTS`. */
  readonly loopbackHosts?: readonly string[];
  /** How many proxy configs a run must read. Default: at least 1. */
  readonly corpus?: ICorpusFloor;
}

/** The names every machine gives itself. A machine with another alias for itself adds it. */
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
    // than guessed at; a consumer that uses the block form needs this widened deliberately.
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

interface IResolveFacts {
  readonly hostModes: readonly string[];
  readonly loopbackHosts: readonly string[];
  readonly fileFor: (m: string) => string;
}

/** Every upstream of one mode that cannot resolve where its proxy runs, with its line. */
function unresolved(mode: string, upstreams: readonly IUpstream[], facts: IResolveFacts): IUpstream[] {
  const runsOnHost = facts.hostModes.includes(mode);
  return upstreams
    .filter(({ upstream }) => !upstream.includes('{$'))
    .filter(({ upstream }) => facts.loopbackHosts.includes(hostOf(upstream)) !== runsOnHost);
}

function messageFor(mode: string, { upstream, line }: IUpstream, facts: IResolveFacts): string {
  const file = facts.fileFor(mode);
  return facts.hostModes.includes(mode)
    ? `${file}:${line} proxies to \`${upstream}\`. The proxy runs on the HOST in ${mode} mode, ` +
        'where a container service name does not resolve — the page answers 502. Use the port ' +
        'the service publishes on this machine.'
    : `${file}:${line} proxies to \`${upstream}\`. The proxy runs INSIDE the container network ` +
        `in ${mode} mode, so a loopback address is the proxy itself — the site answers 502 on a ` +
        'public host. Use the service name.';
}

/** What is wrong with one mode's upstreams, as the messages the check reports. */
export function violationsFor(mode: string, upstreams: readonly IUpstream[], facts: IResolveFacts): string[] {
  return unresolved(mode, upstreams, facts).map((u) => messageFor(mode, u, facts));
}

export function proxyUpstreams(options: IProxyUpstreamsOptions): ICheck {
  checkOptions('proxyUpstreams', options, {
    ...MODULE_OPTIONS,
    modes: { kind: 'array', required: true, nonEmpty: true },
    fileFor: { kind: 'function', required: true },
    hostModes: { kind: 'array', required: true },
    loopbackHosts: { kind: 'array', nonEmpty: true },
  });
  const facts: IResolveFacts = { ...options, loopbackHosts: options.loopbackHosts ?? DEFAULT_LOOPBACK_HOSTS };

  return buildCheck(
    opsIdentity(options, 'proxy-upstreams', 'every upstream a proxy names is a service that exists in that mode'),
    ['read'],
    (ctx, self): IVerdict => {
      const findings: IFinding[] = [];
      const skipped: IFinding[] = [];
      let read = 0;

      for (const mode of options.modes) {
        const file = options.fileFor(mode);
        const source = ctx.files.tryRead(file);
        if (source === undefined) {
          skipped.push(note(`SKIPPED ${mode}: ${file} not present.`));
          continue;
        }
        read += 1;

        const upstreams = parseUpstreams(source);
        if (upstreams.length === 0) {
          findings.push(
            failure(
              `${file} has no \`reverse_proxy\` upstream this check can read — point \`fileFor\` at the ` +
                "mode's Caddy config, or write its upstreams as `reverse_proxy <host>:<port>`.",
              file,
            ),
          );
          continue;
        }

        for (const u of unresolved(mode, upstreams, facts))
          findings.push(failure(messageFor(mode, u, facts), file, u.line));
      }

      const floor = belowCorpusFloor(
        self.id,
        read,
        options.corpus,
        `none of the proxy configs \`fileFor\` names exists (${options.modes.map((m) => options.fileFor(m)).join(', ')})`,
        'proxy config',
      );
      if (floor) return { ...floor, findings: [...floor.findings, ...skipped] };

      return verdictFrom(
        [...withExaminedNote(findings, self.id, read, 'proxy config'), ...skipped],
        thresholdOf(ctx, self),
      );
    },
  );
}
