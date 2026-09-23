import type { IVerdict } from 'specwarden';

/**
 * The verdict of a check whose corpus came back empty: a FAILURE, never a clean run.
 *
 * A pathspec that matches nothing — a folder that moved, a glob with a typo, a filter
 * that excluded everything — leaves a documentation check scanning zero documents and
 * finding zero defects. Reported as a pass, that is the check that cannot fail, and it
 * stays green for as long as nobody happens to look. Naming the pathspec is what makes
 * the repair a one-line edit instead of an investigation.
 */
export function nothingExamined(ruleId: string, pathspec: string, what = 'document'): IVerdict {
  return {
    ok: false,
    findings: [
      {
        severity: 'error',
        ruleId,
        message:
          `no ${what} matched \`${pathspec}\` — this check examined nothing, and a check that ` +
          'examined nothing cannot fail. Point the pathspec at where the files actually are.',
      },
    ],
  };
}
