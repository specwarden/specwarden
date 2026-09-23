export * from './container';
export * from './runner';
export * from './plugin-loader';
export * from './perimeter';
export { defineConfig } from './config/config.model';
export type { IWardenConfig, TSharedBuildInput } from './config/config.model';
export { main, parseArgs, findConfig, newCheck } from './cli';
export type { ICliIo } from './cli';
export { detectRepo } from './cli/adopt/detect-repo/detect-repo.util';
export type { IRepoShape, TPackageManager, TTestRunner } from './cli/adopt/detect-repo/detect-repo.util';
export { inferSibling } from './cli/suggest/infer-sibling/infer-sibling.util';
export type {
  IInferSiblingOptions,
  ISiblingInference,
  TListFiles,
} from './cli/suggest/infer-sibling/infer-sibling.util';
export { parsePlan } from './planner/plan-parser/plan-parser.util';
export type { IParsedPlan } from './planner/plan-parser/plan-parser.util';
export { renderPlan } from './planner/plan-render/plan-render.util';
export { native } from './spec-source';
export type { INativeOptions } from './spec-source';
export { orphanChecks, ruleOwnerFindings, orphanCheck } from './rules';
export type { IOrphanCheckOptions } from './rules';
export {
  generateConstraintCard,
  ConstraintCardTooLongError,
  ConstraintCardTooManyLinesError,
  ConstraintCardMissingLineError,
} from './constraint-card/constraint-card.util';
export type { IConstraintCardOptions } from './constraint-card/constraint-card.util';
// The perimeter's pure core, public so a consumer can test ITS OWN rules along the
// path the agent hook actually takes — payload in, exit code out — instead of
// re-assembling that path in a test and pinning a copy of it.
export { evaluatePayload } from './cli/perimeter/perimeter.command';

// The consumer tree, read by convention — checks discovered under checks/, the
// harness's own checks assembled from defaults. The reason a config can be short.
export {
  discoverChecks,
  CheckDiscoveryError,
  harnessChecks,
  HARNESS_CHECK_IDS,
  loadConsumerTree,
} from './consumer-tree';
export type { IDiscoveredChecks, IHarnessOptions, IHarnessInputs, ILoadedTree } from './consumer-tree';
export { commandCheck } from './runner/command-check/command-check.check';
