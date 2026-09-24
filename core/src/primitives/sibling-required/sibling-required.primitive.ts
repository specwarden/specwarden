import type { ICheck, ICheckDeclaration, IFinding } from '../../domain';
import {
  type ICorpusFloor,
  type TPathspecs,
  belowCorpusFloor,
  buildCheck,
  checkOptions,
  dirOf,
  emptyCorpusReason,
  joinDir,
  stem,
  thresholdOf,
  trackedCorpus,
  verdictFrom,
  withExaminedNote,
} from '../_shared';

export interface ISiblingRequiredOptions extends ICheckDeclaration {
  /**
   * The TRACKED files that must have a sibling: a pathspec, or several whose matches are
   * joined.
   *
   * It was called `when`, and then `subjects`: `when` on every other check means "which
   * CHANGES make this relevant", and here it meant "which FILES this rule is about" — and
   * every other primitive names its corpus `files`.
   */
  readonly files: TPathspecs;
  /** The sibling, as a template relative to the file's directory. `{name}` is the
   * file's stem (basename minus its final extension). */
  readonly require: string;
  /** Pathspecs among `files` that need no sibling — the tests themselves, when the
   * subjects are every source file of a folder. */
  readonly except?: readonly string[];
  /** How many files must exist for a verdict to count. Defaults to one: a rule over
   * no file requires nothing, and it passed in silence. */
  readonly corpus?: ICorpusFloor;
}

/**
 * A file of one shape requires a neighbour of another — the structure behind
 * `spec-placement` and `fe-test-placement`: a service has a spec beside it.
 */
export function siblingRequired(options: ISiblingRequiredOptions): ICheck {
  checkOptions('siblingRequired', options, {
    files: { kind: ['string', 'array'], required: true, nonEmpty: true },
    require: { kind: 'string', required: true },
    except: { kind: 'array' },
    corpus: { kind: 'object' },
  });
  return buildCheck(options, ['read'], (ctx, self) => {
    const corpus = trackedCorpus(ctx.vcs, options.files, options.except);
    const short = belowCorpusFloor(
      self.id,
      corpus.files.length,
      options.corpus,
      emptyCorpusReason(options.files, corpus, 'require a sibling of'),
    );
    if (short) return short;

    const findings: IFinding[] = [];
    for (const file of corpus.files) {
      const sibling = joinDir(dirOf(file), options.require.replace('{name}', stem(file)));
      if (!ctx.files.exists(sibling)) {
        findings.push({
          severity: 'error',
          file,
          message: `${file} requires a sibling ${sibling}, which is missing.`,
        });
      }
    }
    return verdictFrom(withExaminedNote(findings, self.id, corpus.files.length), thresholdOf(ctx, self));
  });
}
