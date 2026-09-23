import { existsSync } from 'node:fs';

import { type IShell, resolveShell } from '../../domain';

let resolved: IShell | undefined;

/**
 * The shell a command runs through on THIS machine when the check names none.
 *
 * `resolveShell` owns the decision and is pure; this hands it the real platform, the
 * real environment and the real filesystem, and remembers the answer — the PATH does not
 * change during a run, and a gate list of thirty command checks should not stat the
 * same `bash.exe` thirty times.
 */
export function platformShell(): IShell {
  resolved ??= resolveShell({ platform: process.platform, env: process.env }, existsSync);
  return resolved;
}

/** Forget the remembered answer — for a spec that changes the environment between cases. */
export function forgetPlatformShell(): void {
  resolved = undefined;
}
