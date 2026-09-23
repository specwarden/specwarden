import type { ICheck, ICheckDeclaration, IFinding } from '../../domain';
import {
  type ICorpusFloor,
  belowCorpusFloor,
  buildCheck,
  checkOptions,
  emptyCorpusReason,
  lineOf,
  testStateless,
  trackedCorpus,
  verdictFrom,
  withExaminedNote,
} from '../_shared';

export interface IForbidPatternOptions extends ICheckDeclaration {
  /** Pathspec of the TRACKED files scanned. */
  readonly in: string;
  /** How many files `in` must match for a verdict to count. Defaults to one: a ban over
   * zero files bans nothing, and it passed in silence before this existed. */
  readonly corpus?: ICorpusFloor;
  /** The pattern that must not appear. Made global internally, so a bare RegExp is fine. */
  readonly pattern: RegExp;
  /** Matches that ARE allowed (a lookalike that is not the real thing). */
  readonly allow?: RegExp;
  /** Pathspecs exempt from the scan. */
  readonly except?: readonly string[];
  /** Per-match message; the matched text is available as `{match}`. */
  readonly message?: string;
}

/**
 * A pattern must not occur in a set of files — `secret-scan`, a banned API, a debug
 * call left behind. The `allow` escape hatch is the half that is usually skipped: a
 * check with false positives is one somebody turns off, taking the true positives
 * with it.
 */
export function forbidPattern(options: IForbidPatternOptions): ICheck {
  checkOptions('forbidPattern', options, {
    in: { kind: 'string', required: true },
    pattern: { kind: 'regexp', required: true },
    allow: { kind: 'regexp' },
    except: { kind: 'array' },
    message: { kind: 'string' },
    corpus: { kind: 'object' },
  });
  const re = new RegExp(
    options.pattern.source,
    options.pattern.flags.includes('g') ? options.pattern.flags : `${options.pattern.flags}g`,
  );
  return buildCheck(options, ['read'], (ctx, self) => {
    const corpus = trackedCorpus(ctx.vcs, options.in, options.except);
    const short = belowCorpusFloor(
      self.id,
      corpus.files.length,
      options.corpus,
      emptyCorpusReason(options.in, corpus, 'scan'),
    );
    if (short) return short;

    const findings: IFinding[] = [];
    let examined = 0;
    for (const file of corpus.files) {
      const content = ctx.files.tryRead(file);
      if (content === undefined) continue;
      examined++;
      for (const m of content.matchAll(re)) {
        if (options.allow && testStateless(options.allow, m[0])) continue;
        findings.push({
          severity: 'error',
          file,
          line: lineOf(content, m.index ?? 0),
          message: (options.message ?? `forbidden pattern in ${file}: {match}`).replace('{match}', m[0]),
          ruleId: self.id,
        });
      }
    }
    return verdictFrom(withExaminedNote(findings, self.id, examined), ctx.ratchet ?? options.ratchet);
  });
}
