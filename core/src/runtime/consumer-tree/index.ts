/**
 * The consumer tree, read by convention.
 *
 * A `.specwarden/` folder has a shape, and the engine knows it: checks under
 * `checks/**\/*.check.mjs`, rules in the config, ratchets in `ratchets/`. Reading
 * that shape is the engine's job, not the consumer's — the alternative was every
 * repository hand-wiring the same seventy lines and one of them forgetting an import.
 */
export { discoverChecks, CheckDiscoveryError } from './discover-checks/discover-checks.util';
export type { IDiscoveredChecks } from './discover-checks/discover-checks.util';
export { selfChecks, SELF_CHECK_IDS } from './self-checks/self-checks.factory';
export type { ISelfCheckOptions, ISelfCheckInputs } from './self-checks/self-checks.factory';
export { loadConsumerTree } from './load-consumer-tree/load-consumer-tree.util';
export type { ILoadedTree } from './load-consumer-tree/load-consumer-tree.util';
