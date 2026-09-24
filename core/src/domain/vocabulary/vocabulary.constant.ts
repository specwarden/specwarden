/**
 * The small closed vocabularies the rest of the domain is built from. String
 * unions with a companion `as const` array (this codebase's preference over `enum`), so
 * a caller can both type-narrow and iterate.
 */

/**
 * Execution tiers — WHEN a check runs, named.
 *
 * The three built-ins describe the rhythm most repositories have: `fast` on every
 * push and cheap enough that nobody skips it, `heavy` as the job CI requires before a merge, `nightly`
 * for what is too slow or too flaky-by-nature for per-push feedback. They were carried
 * over verbatim from the roster this engine first replaced, which is exactly why
 * they must not be the only ones allowed: they are one repository's tiers, and a
 * product zone may not hold a consumer's facts.
 *
 * A repository whose rhythm is `pre-commit` / `pr` / `release` declares `tiers` in its
 * config and uses those names throughout; the built-ins stay as the default so a
 * repository that has no opinion is not made to invent one. The `string & {}` arm is
 * what admits a custom name while keeping editor completion on the three built-ins —
 * a bare `string` would silently accept a typo'd tier as a legitimate one.
 */
export type TTier = 'fast' | 'heavy' | 'nightly' | (string & {});
export const TIERS = ['fast', 'heavy', 'nightly'] as const;

/**
 * What a check is allowed to touch. A check DECLARES the capabilities it needs and
 * the engine denies everything undeclared — a check with only `read` is handed a
 * process runner whose methods throw. The side benefit lands immediately on
 * migration: it becomes visible which checks actually spawn anything.
 */
export type TCapability = 'read' | 'exec' | 'write' | 'net';
export const CAPABILITIES = ['read', 'exec', 'write', 'net'] as const;

/** The weight of a single finding. `error` fails a blocking check; `warning` is
 * what an advisory check emits; `info` never fails anything. */
export type TSeverity = 'error' | 'warning' | 'info';
export const SEVERITIES = ['error', 'warning', 'info'] as const;

/**
 * The major version of the check contract (the shape of `ICheck` and the context
 * it receives). A check records the version it was built against; the engine
 * refuses to load one whose major differs, with a legible message rather than a
 * crash somewhere inside `run`. Bump this only on a breaking change to the
 * contract — the whole point is that an incompatible check fails at load, loudly.
 */
export const CHECK_CONTRACT_VERSION = 1;
