import type { ICheck, ICheckDeclaration, IFinding } from '../../domain';
import {
  type ICorpusFloor,
  type TPathspecs,
  belowCorpusFloor,
  buildCheck,
  checkOptions,
  emptyCorpusReason,
  lineOf,
  testStateless,
  thresholdOf,
  trackedCorpus,
  verdictFrom,
  withExaminedNote,
} from '../_shared';

export interface IForbidPatternOptions extends ICheckDeclaration {
  /** The TRACKED files scanned: a pathspec, or several whose matches are joined. */
  readonly files: TPathspecs;
  /** How many files `files` must match for a verdict to count. Defaults to one: a ban over
   * zero files bans nothing, and it passed in silence before this existed. */
  readonly corpus?: ICorpusFloor;
  /** The pattern that must not appear. Made global internally, so a bare RegExp is fine. */
  readonly pattern: RegExp;
  /** Matches that ARE allowed (a lookalike that is not the real thing). */
  readonly allowMatch?: RegExp;
  /** Pathspecs exempt from the scan. */
  readonly except?: readonly string[];
  /** Per-match message; the matched text is available as `{match}`. */
  readonly message?: string;
}

/**
 * A pattern must not occur in a set of files — `secret-scan`, a banned API, a debug
 * call left behind. The `allowMatch` escape hatch is the half that is usually skipped: a
 * check with false positives is one somebody turns off, taking the true positives
 * with it.
 */
export function forbidPattern(options: IForbidPatternOptions): ICheck {
  checkOptions('forbidPattern', options, {
    files: { kind: ['string', 'array'], required: true, nonEmpty: true },
    pattern: { kind: 'regexp', required: true },
    allowMatch: { kind: 'regexp' },
    except: { kind: 'array' },
    message: { kind: 'string' },
    corpus: { kind: 'object' },
  });
  const re = new RegExp(
    options.pattern.source,
    options.pattern.flags.includes('g') ? options.pattern.flags : `${options.pattern.flags}g`,
  );
  return buildCheck(options, ['read'], (ctx, self) => {
    const corpus = trackedCorpus(ctx.vcs, options.files, options.except);
    const short = belowCorpusFloor(
      self.id,
      corpus.files.length,
      options.corpus,
      emptyCorpusReason(options.files, corpus, 'scan'),
    );
    if (short) return short;

    const findings: IFinding[] = [];
    let examined = 0;
    for (const file of corpus.files) {
      const content = ctx.files.tryRead(file);
      if (content === undefined) continue;
      examined++;
      for (const m of content.matchAll(re)) {
        if (options.allowMatch && testStateless(options.allowMatch, m[0])) continue;
        findings.push({
          severity: 'error',
          file,
          line: lineOf(content, m.index ?? 0),
          message: (options.message ?? `forbidden pattern in ${file}: {match}`).replace('{match}', m[0]),
        });
      }
    }
    return verdictFrom(withExaminedNote(findings, self.id, examined), thresholdOf(ctx, self));
  });
}
