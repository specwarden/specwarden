/**
 * The domain barrel — pure types and interfaces, no disk access and no decorators.
 * This is the floor of the engine's dependency graph: everything else depends on
 * it, it depends on nothing. Values (the `as const` vocabularies, the typed error
 * classes) are re-exported plainly; the interfaces as `export type`, because
 * `isolatedModules` cannot tell a type re-export from a value one on its own.
 */

// Zones — the barrier's pure floor: the two values, and the rule that a declared zone
// must match the one a file's location implies.
export { ZONES, SpecwardenZoneError, assertZoneMatchesLocation } from './zone/zone.model';
export type { TZone } from './zone/zone.model';

// Vocabularies and the contract version.
export { TIERS, CAPABILITIES, SEVERITIES, CHECK_CONTRACT_VERSION } from './vocabulary/vocabulary.constant';
export type { TTier, TCapability, TSeverity } from './vocabulary/vocabulary.constant';

// When a check matters. It lives in the domain because it is part of a check's own
// declaration — a factory that could not carry it silently made every check it built
// always-relevant, which is a filter nobody wrote and nobody could see.
export { changedContaining, changedEnding, changedUnder, resolveWhen } from './relevance/relevance.model';
export type { IWhenSpec, TWhen } from './relevance/relevance.model';

// Findings and verdicts.
export type { IFinding, IVerdict } from './finding/finding.model';

// Checks.
export { isFixable } from './check/check.model';
export type {
  ICheck,
  ICheckContext,
  ICheckMeta,
  ICheckResult,
  ICheckRule,
  IFixable,
  IFixOutcome,
} from './check/check.model';
export type { ICheckIdentity, TCheckFactory } from './check-factory/check-factory.model';

// Ratchets — the value, and the three pure questions every consumer of one asks:
// which way is forward, what does forward give, and does this measurement hold.
export { isTighter, satisfiesRatchet, tightenedTo } from './ratchet/ratchet.model';
export type { IRatchet, TRatchetDirection } from './ratchet/ratchet.model';

// Rules and the perimeter.
export { computeCoverage, isDeclaredUnenforceable, isEnforced } from './rule/rule.model';
export type { IRule, IRuleCoverage, TRuleEnforcement } from './rule/rule.model';
export { ALLOW } from './perimeter/perimeter.model';
export type { IActionIntent, IPerimeterRule, IPerimeterVerdict } from './perimeter/perimeter.model';

// Document kinds, instruments, plans.
export type { IPlugin, TPluginFactory } from './plugin/plugin.model';

// Interop: spec sources and the ownership map.
export type { ISpecRequirement, ISpecSource, ISpecSourceResult, ISpecTask } from './spec-source/spec-source.model';
export { planInvariantSync, invariantsInDocument } from './sync-invariants/sync-invariants.model';
export type {
  IExistingInvariant,
  IInvariantDeposit,
  IInvariantSyncPlan,
} from './sync-invariants/sync-invariants.model';
export { OWNABLE_ROLES, ownsRole, validateOwnership } from './ownership/ownership.model';
export type { IOwnershipFinding, TOwnableRole, TOwnershipMap } from './ownership/ownership.model';
export { PLAN_STATUSES } from './plan/plan.model';
export type { IPlan, IPlanPhase, TPlanStatus } from './plan/plan.model';
export { computeLifecycle, isForwardTransition } from './plan-lifecycle/plan-lifecycle.model';
export type { ILifecycleInputs, TPlanLifecycle } from './plan-lifecycle/plan-lifecycle.model';
export { parseDecisionLog, rejectionsWithoutReason } from './decision-log/decision-log.model';
export type { IDecision, IRejectedAlternative } from './decision-log/decision-log.model';
export { parseHarvest, archiveReadiness } from './plan-archive/plan-archive.model';
export type { IHarvestEntry, IHarvestParse, IArchiveReadiness } from './plan-archive/plan-archive.model';

// Ports.
export { FileNotFoundError } from './ports';
export type {
  IAgentRuntime,
  IClock,
  IFileSource,
  IFileWriter,
  IProcessOptions,
  IProcessResult,
  IProcessRunner,
  IRatchetStore,
  IReporter,
  IVcs,
} from './ports';

// How a command line becomes a process — one type, one default, every caller optional.
export { DEFAULT_SHELL, shellArgv, shellStartFailure } from './shell/shell.model';
export type { IShell } from './shell/shell.model';

// A template — a starting tree for a kind of repository, emitted as ordinary files.
export type { ITemplate, ITemplateContext, ITemplateFile } from './template/template.model';
