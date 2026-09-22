/**
 * How a command line becomes a process.
 *
 * `bash -c` is the common case and a poor assumption to hardcode: a Windows checkout
 * without Git Bash has no bash at all, some containers ship only `sh`, and a house may
 * standardise on `pwsh`. The engine had three separate `proc.run('bash', ['-c', …])`
 * call sites, which is three places to fix and three chances to fix only two.
 *
 * One type, one default, and every caller takes it as an option.
 */
export interface IShell {
  /** The executable — `bash`, `sh`, `pwsh`, `cmd`. */
  readonly command: string;
  /** The arguments that precede the command line, e.g. `['-c']`. */
  readonly args: readonly string[];
}

/** The common case, and only the default. */
export const DEFAULT_SHELL: IShell = { command: 'bash', args: ['-c'] };

/** The argv for running `line` through `shell`. */
export function shellArgv(shell: IShell, line: string): readonly string[] {
  return [...shell.args, line];
}

/**
 * The message for a shell that could not be STARTED.
 *
 * Shared so the wording is identical wherever it happens: a reader who meets it in a
 * check and again in a plan's acceptance should recognise it as one condition, not
 * two unrelated faults.
 */
export function shellStartFailure(who: string, shell: IShell, spawnError: string): string {
  return (
    `${who}: could not start the shell '${shell.command}' (${spawnError}). ` +
    `The command was never run — set the shell to one this machine has, ` +
    `for example { command: 'sh', args: ['-c'] }.`
  );
}
