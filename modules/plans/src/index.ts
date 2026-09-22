/**
 * Checks over PLANS and DECISION LOGS — documents that describe work in flight.

 * The lifecycle they assume (a plan is written, worked, harvested and archived; a
 * decision is raised, argued and closed) is one way of working, not the only one. It
 * ships as a module so a house that plans differently simply does not install it,
 * rather than switching its checks off one by one.
 */
export { planStaleness } from './plan-staleness/plan-staleness.check';
export type { IPlanStalenessOptions, IArchiveHeaderField } from './plan-staleness/plan-staleness.check';
// The default plan convention, exported so a house adapting it starts from something
// rather than inventing a header format to satisfy a check.
export {
  DEFAULT_BRANCH_DECLARATION,
  DEFAULT_STATUS_DECLARATION,
  DEFAULT_ACTIVE_STATUSES,
  DEFAULT_ARCHIVE_HEADER,
} from './plan-staleness/plan-staleness.check';
export { planShape } from './plan-shape/plan-shape.check';
export type { IPlanShapeOptions } from './plan-shape/plan-shape.check';
export { decisionLogShape } from './decision-log-shape/decision-log-shape.check';
export type { IDecisionLogShapeOptions } from './decision-log-shape/decision-log-shape.check';
