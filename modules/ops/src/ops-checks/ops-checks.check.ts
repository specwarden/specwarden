import { CheckOptionsError, type ICheck, type TTier, type TWhen, checkOptions } from 'specwarden';

import { type IBuildOrderOptions, buildOrder } from '../build-order/build-order.check';
import { type ICiCoverageOptions, ciCoverage } from '../ci-coverage/ci-coverage.check';
import { type IEnvPairingOptions, envPairing } from '../env-pairing/env-pairing.check';
import { type IProxyUpstreamsOptions, proxyUpstreams } from '../proxy-upstreams/proxy-upstreams.check';
import { type IShellScopeOptions, shellScope } from '../shell-scope/shell-scope.check';

/** One check's options, or `false` to leave it out. */
export type TOpsEntry<T> = false | T;

export interface IOpsChecksOptions {
  /** The tier every check is built in, unless its own options say another. Default: `fast`. */
  readonly tier?: TTier;
  /** When every check is relevant, unless its own options say otherwise. Default: always. */
  readonly when?: TWhen;
  /** `env-pairing` — its compose file, modes, verifier and declared keys. */
  readonly envPairing?: TOpsEntry<IEnvPairingOptions>;
  /** `proxy-upstreams` — its modes, `fileFor` and `hostModes`. */
  readonly proxyUpstreams?: TOpsEntry<IProxyUpstreamsOptions>;
  /** `ci-coverage` — its workflow file and required job. */
  readonly ciCoverage?: TOpsEntry<ICiCoverageOptions>;
  /** `build-order` — its packages directory, scope, container files and build invocation. */
  readonly buildOrder?: TOpsEntry<IBuildOrderOptions>;
  /** `shell-scope` — every option has a default; `{}` takes them all. */
  readonly shellScope?: TOpsEntry<IShellScopeOptions>;
}

/** What each check cannot default, in the words the refusal asks for it. */
const FACTS: Readonly<Record<Exclude<keyof IOpsChecksOptions, 'tier' | 'when'>, string | undefined>> = {
  envPairing: '{ composeFile, modes, verifierService, declaredKeys }',
  proxyUpstreams: '{ modes, fileFor, hostModes }',
  ciCoverage: '{ workflowFile, requiredJob }',
  buildOrder: '{ packagesDir, scopePrefix, containerFiles, buildInvocation }',
  shellScope: undefined,
};

/**
 * The whole module in one call: the five checks, each with its own id, in one tier.
 *
 * WHY A PRESET. Each check here assumes a stack, so each is wired with the facts only the
 * repository has — and wired one factory at a time, the `tier` and the `when` were said five
 * times, and one of the five was always the one somebody forgot. Here they are said once.
 *
 * EVERY CHECK IS BUILT UNLESS IT IS TOLD `false`. A check whose facts are missing is refused
 * by name, saying how to leave it out, rather than left out quietly — a preset that returned
 * four checks when five were expected is a roster somebody believes is complete.
 */
export function opsChecks(options: IOpsChecksOptions = {}): ICheck[] {
  checkOptions(
    'opsChecks',
    options,
    {
      tier: { kind: 'string', nonEmpty: true },
      when: { kind: ['function', 'object'] },
      envPairing: { kind: ['object', 'boolean'] },
      proxyUpstreams: { kind: ['object', 'boolean'] },
      ciCoverage: { kind: ['object', 'boolean'] },
      buildOrder: { kind: ['object', 'boolean'] },
      shellScope: { kind: ['object', 'boolean'] },
    },
    { identity: false },
  );
  const shared = {
    ...(options.tier === undefined ? {} : { tier: options.tier }),
    ...(options.when === undefined ? {} : { when: options.when }),
  };

  /** A check's options with the preset's tier and `when` under them, or its facts asked for. */
  const entry = <T extends object>(key: keyof typeof FACTS): T | undefined => {
    const given = options[key] as object | boolean | undefined;
    if (given === false) return undefined;
    if (given === undefined || given === true) {
      if (FACTS[key] !== undefined) {
        throw new CheckOptionsError(`opsChecks: pass \`${key}: ${FACTS[key]}\`, or \`${key}: false\` to leave it out.`);
      }
      return { ...shared } as T;
    }
    return { ...shared, ...given } as T;
  };

  const checks: ICheck[] = [];
  const env = entry<IEnvPairingOptions>('envPairing');
  if (env) checks.push(envPairing(env));
  const upstreams = entry<IProxyUpstreamsOptions>('proxyUpstreams');
  if (upstreams) checks.push(proxyUpstreams(upstreams));
  const ci = entry<ICiCoverageOptions>('ciCoverage');
  if (ci) checks.push(ciCoverage(ci));
  const order = entry<IBuildOrderOptions>('buildOrder');
  if (order) checks.push(buildOrder(order));
  const shell = entry<IShellScopeOptions>('shellScope');
  if (shell) checks.push(shellScope(shell));
  return checks;
}
