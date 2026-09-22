import type { ICheck, ICheckIdentity, IFinding } from '../../domain';
import { buildCheck, lineOf, testStateless, verdictFrom } from '../_shared';

export interface IForbidPatternOptions extends ICheckIdentity {
  /** Glob of files scanned. */
  readonly in: string;
  /** The pattern that must not appear. Made global internally, so a bare RegExp is fine. */
  readonly pattern: RegExp;
  /** Matches that ARE allowed (a lookalike that is not the real thing). */
  readonly allow?: RegExp;
  /** Globs exempt from the scan. */
  readonly except?: readonly string[];
  /** Per-match message; the matched text is available as `{match}`. */
  readonly message?: string;
}

/**
 * A pattern must not occur in a set of files — `secret-scan`, `log-error-bindings`,
 * `story-strings`. The `allow` escape hatch is the half that is usually skipped: a
 * check with false positives is one somebody turns off, taking the true positives
 * with it.
 */
export function forbidPattern(options: IForbidPatternOptions): ICheck {
  const re = new RegExp(
    options.pattern.source,
    options.pattern.flags.includes('g') ? options.pattern.flags : `${options.pattern.flags}g`,
  );
  return buildCheck(options, ['read'], (ctx) => {
    const exempt = new Set((options.except ?? []).flatMap((g) => ctx.files.glob(g)));
    const findings: IFinding[] = [];
    for (const file of ctx.files.glob(options.in)) {
      if (exempt.has(file)) continue;
      const content = ctx.files.read(file);
      for (const m of content.matchAll(re)) {
        if (options.allow && testStateless(options.allow, m[0])) continue;
        findings.push({
          severity: 'error',
          file,
          line: lineOf(content, m.index ?? 0),
          message: (options.message ?? `forbidden pattern in ${file}: {match}`).replace('{match}', m[0]),
          ruleId: options.id,
        });
      }
    }
    return verdictFrom(findings, ctx.ratchet ?? options.ratchet);
  });
}
