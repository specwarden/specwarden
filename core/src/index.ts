/**
 * The product's public surface. A consumer's `.specwarden/config.mjs`
 * imports from here — `defineConfig`, `commandCheck`, the checks, the primitives and
 * the domain types — and never reaches into a subpath.
 */
export * from './domain';
export * from './infrastructure';
export * from './runtime';
export * from './primitives';
export * from './checks';
export * from './testing';
export { CONFIG_VERSION, OUTPUT_VERSION } from './contracts/version/version.constant';
