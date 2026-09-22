/**
 * The subprocess port. A check that shells out (a linter, a compiler) does it
 * through this, and only if it declared the `exec` capability — the engine hands
 * a non-`exec` check a runner whose `run` throws. Synchronous, matching the
 * legacy guards and keeping the runner's output order deterministic for golden
 * comparison; a future async need is a reason to revise the port, which is
 * declared temporary until three guards have driven it.
 */
export interface IProcessOptions {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  /** Written to the child's stdin, if any. */
  readonly input?: string;
  /** Kill the child after this many seconds. */
  readonly timeoutSec?: number;
}

export interface IProcessResult {
  /** Exit code, or `null` if the process was killed by a signal. */
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /**
   * Set when the process could not be STARTED at all — a missing binary, a permission
   * error — as opposed to started and failed.
   *
   * The two are indistinguishable from `status` alone (both give a non-zero or a
   * null), and conflating them sends a reader to debug a command that never ran.
   */
  readonly spawnError?: string;
}

export interface IProcessRunner {
  run(command: string, args: readonly string[], options?: IProcessOptions): IProcessResult;
  /**
   * The same call, without blocking the thread.
   *
   * OPTIONAL, and the reason it exists: `run` is synchronous, which is what makes a
   * run's output deterministic and a check easy to write — but a synchronous spawn
   * holds the event loop, so no amount of concurrency in the runner overlaps two
   * commands. A check that wants to be overlappable uses this when the adapter
   * offers it and falls back to `run` when it does not.
   */
  runAsync?(command: string, args: readonly string[], options?: IProcessOptions): Promise<IProcessResult>;
}
