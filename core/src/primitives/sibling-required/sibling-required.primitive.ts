import type { ICheck, ICheckDeclaration, IFinding } from '../../domain';
import {
  type ICorpusFloor,
  belowCorpusFloor,
  buildCheck,
  checkOptions,
  dirOf,
  emptyCorpusReason,
  joinDir,
  stem,
  trackedCorpus,
  verdictFrom,
  withExaminedNote,
} from '../_shared';

export interface ISiblingRequiredOptions extends ICheckDeclaration {
  /**
   * Pathspec of the TRACKED files that must have a sibling.
   *
   * It was called `when` and had to be renamed: `when` on every other check means
   * "which CHANGES make this relevant", and here it meant "which FILES this rule is
   * about". Two meanings on one word, in a type that inherits the other one — and the
   * collision is what surfaced the real defect behind it, that no factory was carrying
   * the relevance predicate at all.
   */
  readonly subjects: string;
  /** The sibling, as a template relative to the file's directory. `{name}` is the
   * file's stem (basename minus its final extension). */
  readonly require: string;
  /** Pathspecs among the subjects that need no sibling — the tests themselves, when the
   * subjects are every source file of a folder. */
  readonly except?: readonly string[];
  /** How many subjects must exist for a verdict to count. Defaults to one: a rule over
   * no subject requires nothing, and it passed in silence. */
  readonly corpus?: ICorpusFloor;
}

/**
 * A file of one shape requires a neighbour of another — the structure behind
 * `spec-placement` and `fe-test-placement`: a service has a spec beside it.
 */
export function siblingRequired(options: ISiblingRequiredOptions): ICheck {
  checkOptions('siblingRequired', options, {
    subjects: { kind: 'string', required: true },
    require: { kind: 'string', required: true },
    except: { kind: 'array' },
    corpus: { kind: 'object' },
  });
  return buildCheck(options, ['read'], (ctx, self) => {
    const corpus = trackedCorpus(ctx.vcs, options.subjects, options.except);
    const short = belowCorpusFloor(
      self.id,
      corpus.files.length,
      options.corpus,
      emptyCorpusReason(options.subjects, corpus, 'require a sibling of'),
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
          ruleId: self.id,
        });
      }
    }
    return verdictFrom(withExaminedNote(findings, self.id, corpus.files.length), ctx.ratchet ?? options.ratchet);
  });
}
