import type { ICheck, ICheckDeclaration, IFinding } from '../../domain';
import {
  type ICorpusFloor,
  type TPathspecs,
  IMPORT_RE,
  belowCorpusFloor,
  buildCheck,
  checkOptions,
  emptyCorpusReason,
  lineOf,
  matchesSpecifier,
  thresholdOf,
  trackedCorpus,
  verdictFrom,
  withExaminedNote,
} from '../_shared';

export interface IForbidImportOptions extends ICheckDeclaration {
  /** The TRACKED files the ban applies to: a pathspec, or several whose matches are joined. */
  readonly files: TPathspecs;
  /** How many files `files` must match for a verdict to count. Defaults to one: a ban
   * over zero files bans nothing, and it passed in silence before this existed. */
  readonly corpus?: ICorpusFloor;
  /** The forbidden module: a string (exact, or a prefix when followed by `/`; one
   * written ending in `/` is a prefix only) or a RegExp tested against the specifier. */
  readonly to: string | RegExp;
  /** Pathspecs whose files are exempt (e.g. the one layer allowed to import it). */
  readonly except?: readonly string[];
}

/**
 * Code under A must not import B, save for an allowed exception C — the database
 * barrier and the FE layering rule. The rule is the compiler, not a convention.
 */
export function forbidImport(options: IForbidImportOptions): ICheck {
  checkOptions('forbidImport', options, {
    files: { kind: ['string', 'array'], required: true, nonEmpty: true },
    to: { kind: ['string', 'regexp'], required: true },
    except: { kind: 'array' },
    corpus: { kind: 'object' },
  });
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
      for (const m of content.matchAll(IMPORT_RE)) {
        if (matchesSpecifier(m[1], options.to)) {
          findings.push({
            severity: 'error',
            file,
            line: lineOf(content, m.index ?? 0),
            message: `${file} imports \`${m[1]}\`, which is forbidden from ${[options.files].flat().join(', ')}.`,
          });
        }
      }
    }
    return verdictFrom(withExaminedNote(findings, self.id, examined), thresholdOf(ctx, self));
  });
}
