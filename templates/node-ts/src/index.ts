/**
 * A starting tree for an ordinary TypeScript repository.
 *
 * A template emits FILES — the same ordinary `checks/<family>/<id>.check.mjs` the
 * engine discovers, which the repository then owns and edits. What it supplies is the
 * DECISIONS: which checks are worth having on day one, which options keep them from
 * being noisy, and which are better left off until somebody asks.
 */
export { nodeTsTemplate } from './node-ts/node-ts.template';
