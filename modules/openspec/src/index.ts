/**
 * The OpenSpec module — reading an OpenSpec tree, for repositories that have one.
 *
 * It is a MODULE and not part of the engine because an integration with somebody
 * else's tool cannot be a mandatory part of a quality harness: a repository that has
 * never heard of OpenSpec would still be carrying its layout assumptions, and every
 * such assumption is a thing that breaks when that tool ships a minor release.
 */
export { openspec } from './openspec/openspec.source';
export type { IOpenspecOptions } from './openspec/openspec.source';
