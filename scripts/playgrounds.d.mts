/**
 * Types for the parts of `playgrounds.mjs` a TypeScript playground imports. The template
 * playgrounds go through `playground-proof.mjs`; the workspace playground composes every
 * package itself, so it builds its scratch repository here directly.
 */

/** One check's result in a `check --all --json` run. */
export interface IPlaygroundResult {
  readonly id: string;
  readonly ok: boolean;
  readonly skipped: unknown;
  readonly messages: readonly string[];
}

/** A scratch repository from a described tree; `installed` is `[name, source directory]`. */
export function scratchTree(
  tree: Readonly<Record<string, string>>,
  options?: { readonly installed?: readonly (readonly [string, string])[]; readonly branches?: readonly string[] },
): string;

export function removeScratch(dir: string): void;

/** `check --all --json` in `dir`: every result, the ids that failed, and the exit code. */
export function verdictsIn(dir: string): {
  readonly status: number | null;
  readonly results: readonly IPlaygroundResult[];
  readonly failed: readonly string[];
};

/**
 * Run the CLI in `dir` — never throws on a non-zero exit; the exit IS the answer.
 * `nodeOnPath` puts the engine's Node first on the PATH, for a command that is the
 * consumer's own: an example a guide tells them to paste.
 */
export function specwarden(
  dir: string,
  args: readonly string[],
  options?: { readonly timeoutSec?: number; readonly input?: string; readonly nodeOnPath?: boolean },
): { readonly status: number | null; readonly stdout: string; readonly stderr: string };

/** The Node the engine runs on in every playground — `PLAYGROUND_NODE`, or the one running the suite. */
export const ENGINE_NODE: string;

/** Link each `[name, source directory]` into `dir/node_modules`. */
export function linkPackages(dir: string, installed: readonly (readonly [string, string])[]): void;

/** The repository root. */
export const ROOT: string;
