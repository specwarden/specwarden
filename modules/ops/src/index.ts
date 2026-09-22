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
export { envFilesAgree, parseCompose, parseEnvFile } from './env-files-agree/env-files-agree.check';
export type { IEnvFilesAgreeOptions, IComposeService } from './env-files-agree/env-files-agree.check';

export { upstreamsResolve, parseUpstreams, hostOf, violationsFor as upstreamViolationsFor } from './upstreams-resolve/upstreams-resolve.check';
export type { IUpstreamsResolveOptions, IUpstream } from './upstreams-resolve/upstreams-resolve.check';

export { gatesHaveCiJobs, parseWorkflowJobs } from './gates-have-ci-jobs/gates-have-ci-jobs.check';
export type { IGateEntry, IGatesHaveCiJobsOptions, IWorkflowJob } from './gates-have-ci-jobs/gates-have-ci-jobs.check';

export { buildOrderFollowsDeps, buildOrder, violationsFor, workspaceDeps } from './build-order-follows-deps/build-order-follows-deps.check';
export type { IBuildOrderOptions } from './build-order-follows-deps/build-order-follows-deps.check';

export { shellLocalScope, functionSpans, localOutsideFunction } from './shell-local-scope/shell-local-scope.check';
export type { IShellLocalScopeOptions } from './shell-local-scope/shell-local-scope.check';
