/**
 * SCAFFOLD PARTS — the pieces a template is assembled from.
 *
 * A template's job is to make DECISIONS: which checks a repository of its kind wants on
 * day one, which options keep them from being noisy, and which to leave out. It is not
 * to hold four hundred lines of generated prose, and it certainly is not to hold the
 * fourth copy of the credential scan.
 *
 * So each check that more than one template wants lives here once, as a PART: the file
 * it writes, the rule that file enforces, and — where one is needed — the config field
 * that makes the two resolve. Templates compose them and phrase what is different.
 *
 * WHY THE PROSE IS OVERRIDABLE. "Why this check earns its place" is genuinely different
 * per repository: a dead documentation path is an inconvenience in a library and a wrong
 * action taken confidently in a repository that agents work in. The generated file is
 * where that reason has to live, because it is the file somebody reads six months later
 * when they are deciding whether to delete the check.
 *
 * This package is a build-time dependency of the templates and never of a generated
 * tree: what `init` writes imports the MODULES directly, so a repository can delete
 * every specwarden template the day after and lose nothing.
 */
export type { IPart, IPartOptions } from './_shared/part.model';
export { compose } from './_shared/compose.util';
export type { IComposed } from './_shared/compose.util';

export { secretScanPart } from './secret-scan/secret-scan.part';
export { docPathsPart } from './doc-paths/doc-paths.part';
export { docHygienePart } from './doc-hygiene/doc-hygiene.part';
export { docCountsExamplePart } from './doc-counts/doc-counts.part';
export { docSymbolsExamplePart } from './doc-symbols/doc-symbols.part';
export { docPlacementExamplePart } from './doc-placement/doc-placement.part';
export { scriptWrappersPart } from './script-wrappers/script-wrappers.part';
export { ciCoveragePart } from './ci-coverage/ci-coverage.part';
export { shellScopePart } from './shell-scope/shell-scope.part';
export { envFilesExamplePart } from './env-files/env-files.part';
export { upstreamsExamplePart } from './upstreams/upstreams.part';
export { planLifecyclePart } from './plan-lifecycle/plan-lifecycle.part';
export type { IPlanLifecycleOptions } from './plan-lifecycle/plan-lifecycle.part';
export { agentRolesPart } from './agent-roles/agent-roles.part';
export type { IAgentRolesOptions } from './agent-roles/agent-roles.part';
export { perimeterPart } from './perimeter/perimeter.part';
export { specSourcePart } from './spec-source/spec-source.part';
export type { TSpecFramework } from './spec-source/spec-source.part';
