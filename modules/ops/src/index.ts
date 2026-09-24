/**
 * Checks over OPERATIONAL configuration: environment files, reverse-proxy upstreams,
 * CI job coverage, workspace build order, and shell scoping.
 *
 * Each assumes a stack — compose files, a Caddyfile, GitHub Actions, a pnpm
 * workspace. That is precisely why they are not in the engine: an assumption about a
 * stack is the fastest way for a product zone to stop being portable.
 *
 * Exports are NAMED rather than star-re-exported. Two of these checks both export a
 * `violationsFor`, and `export *` makes that ambiguous — silently in an editor, then
 * loudly at the declaration emit. Naming them is also how the collision gets a
 * decision instead of a default: the upstream one is prefixed, because a caller
 * reaching for `violationsFor` almost always means the build-order one.
 */
export { opsChecks } from './ops-checks/ops-checks.check';
export type { IOpsChecksOptions, TOpsEntry } from './ops-checks/ops-checks.check';

export { envPairing, parseCompose, parseEnvFile } from './env-pairing/env-pairing.check';
export type { IEnvPairingOptions, IComposeService } from './env-pairing/env-pairing.check';

export {
  proxyUpstreams,
  parseUpstreams,
  hostOf,
  violationsFor as upstreamViolationsFor,
  DEFAULT_LOOPBACK_HOSTS,
} from './proxy-upstreams/proxy-upstreams.check';
export type { IProxyUpstreamsOptions, IUpstream } from './proxy-upstreams/proxy-upstreams.check';

export { ciCoverage, parseWorkflowJobs, DEFAULT_RUNNER_PATTERN } from './ci-coverage/ci-coverage.check';
export type { ICheckEntry, ICiCoverageOptions, IWorkflowJob } from './ci-coverage/ci-coverage.check';

export { buildOrder, buildSequence, violationsFor, workspaceDeps } from './build-order/build-order.check';
export type { IBuildOrderOptions } from './build-order/build-order.check';

export { shellScope, functionSpans, localOutsideFunction } from './shell-scope/shell-scope.check';
export type { IShellScopeOptions } from './shell-scope/shell-scope.check';
