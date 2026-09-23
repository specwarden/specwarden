import type { IFileSource, IFinding } from 'specwarden';

/**
 * The plans folder as a check finds it: absent, not a folder, or listed.
 *
 * WHY ABSENT IS A FAILURE. Every check in this package reads the folder its options name,
 * and three of them gave three answers to "it is not there": one passed with a green tick,
 * one said "nothing to verify", one failed. The first two are the check that cannot fail —
 * a `plansDir` left pointing at a folder that moved reports a clean lifecycle forever.
 *
 * AN EXISTING FOLDER WITH NO PLAN IN IT IS NOT. "Nothing is in flight" is a true statement
 * about a repository between pieces of work, and a check that went red over it would be
 * switched off by the first team that finished everything.
 */
export type TPlansFolder = { readonly listed: readonly string[] } | { readonly refused: IFinding };

export function plansFolder(files: IFileSource, dir: string, ruleId: string, option = 'plansDir'): TPlansFolder {
  if (!files.exists(dir)) {
    return {
      refused: {
        severity: 'error',
        ruleId,
        message:
          `${dir} does not exist — this check examined nothing, and a check that examined nothing cannot ` +
          `fail. Point \`${option}\` at the folder the plans live in, or create it.`,
      },
    };
  }
  // `isDirectory` as well as `exists`: a FILE at that path passed the existence test and
  // then threw on the listing, crashing the run instead of reporting anything.
  if (!files.isDirectory(dir)) {
    return {
      refused: {
        severity: 'error',
        ruleId,
        message: `${dir} is a file, not a folder of plans. Point \`${option}\` at the folder.`,
      },
    };
  }
  return { listed: files.list(dir) };
}

/** The line a folder holding no plan yet reports — a pass, and says what it saw. */
export const nothingInFlight = (dir: string): IFinding => ({
  severity: 'info',
  message: `no plan in ${dir} — nothing in flight`,
});
