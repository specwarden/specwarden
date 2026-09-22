/**
 * The Spec Kit module — reading a Spec Kit tree, for repositories that have one.
 *
 * Same reasoning as the OpenSpec module: the ENGINE owns the `ISpecSource` port, and
 * every concrete tool that fills it lives outside, so a new spec framework needs a new
 * package and no change to the engine at all.
 */
export { speckit } from './speckit/speckit.source';
export type { ISpeckitOptions } from './speckit/speckit.source';
