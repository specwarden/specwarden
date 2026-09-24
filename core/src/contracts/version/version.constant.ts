/**
 * The versions the product PROMISES against, kept apart from any single subsystem
 * because they are the surface a consumer depends on across upgrades.
 *
 * Two independent numbers:
 * - CHECK_CONTRACT_VERSION (in domain) is the shape of a check; the engine refuses
 *   to load a check built against an incompatible major.
 * - CONFIG_VERSION is the shape of `.specwarden/config.mjs`; a config
 *   declaring a newer major than the engine speaks is refused with a message that
 *   names the fix, and `specwarden migrate` is the upgrade path — the archaeology
 *   Spec Kit makes users do is exactly what this avoids.
 */
export const CONFIG_VERSION = 1;

/**
 * The shape of every JSON document the command line prints — a run under `--reporter json`,
 * `check --list --json`, `doctor --json`. Each carries it as `version`, so a script reads it
 * before the rest; a key removed or renamed in any of them moves this number.
 */
export const OUTPUT_VERSION = 1;
