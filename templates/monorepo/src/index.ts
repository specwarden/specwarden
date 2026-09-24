/**
 * A starting tree for a pnpm workspace.
 *
 * The build-order and dependency-pin checks are why this exists rather than being
 * "node-ts, run once per package": a drifted lockfile, a build order contradicting the
 * dependency graph, and two majors of one library across workspaces all fail QUIETLY.
 */
export { monorepoTemplate } from './monorepo/monorepo.template';
