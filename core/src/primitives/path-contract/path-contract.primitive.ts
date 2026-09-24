import type { ICheck, ICheckDeclaration, IFinding } from '../../domain';
import { pathspecMatcher } from '../../infrastructure/git-vcs/git-pathspec/git-pathspec.util';
import {
  type ICorpusFloor,
  type TPathspecs,
  belowCorpusFloor,
  buildCheck,
  checkOptions,
  emptyCorpusReason,
  thresholdOf,
  trackedCorpus,
  verdictFrom,
  withExaminedNote,
} from '../_shared';

export interface IPathContractOptions extends ICheckDeclaration {
  /** The TRACKED files this contract governs — the kind of file, as a pathspec or several. */
  readonly files: TPathspecs;
  /** Pathspecs among `files` that are exempt. */
  readonly except?: readonly string[];
  /** The pathspecs a file of this kind may live under. Living outside all of them fails. */
  readonly allowedIn: readonly string[];
  /** How many of `files` must exist for a verdict to count. Defaults to one: a
   * contract over no file of its kind governs nothing, and it passed in silence. */
  readonly corpus?: ICorpusFloor;
}

/**
 * A file of a kind lives only where its contract allows — `doc-placement`. An
 * undecided location is where a partial second copy is born, which is the most
 * expensive documentation defect measured in this corpus.
 */
export function pathContract(options: IPathContractOptions): ICheck {
  checkOptions('pathContract', options, {
    files: { kind: ['string', 'array'], required: true, nonEmpty: true },
    except: { kind: 'array' },
    allowedIn: { kind: 'array', required: true },
    corpus: { kind: 'object' },
  });
  const allowed = options.allowedIn.map((glob) => pathspecMatcher(glob));
  return buildCheck(options, ['read'], (ctx, self) => {
    const corpus = trackedCorpus(ctx.vcs, options.files, options.except);
    const short = belowCorpusFloor(
      self.id,
      corpus.files.length,
      options.corpus,
      emptyCorpusReason(options.files, corpus, 'hold to its contract'),
    );
    if (short) return short;

    const findings: IFinding[] = [];
    for (const file of corpus.files) {
      if (!allowed.some((matches) => matches(file))) {
        findings.push({
          severity: 'error',
          file,
          message: `${file} is one of \`${[options.files].flat().join(', ')}\` but lives outside its contract (${options.allowedIn.join(', ')}).`,
        });
      }
    }
    return verdictFrom(withExaminedNote(findings, self.id, corpus.files.length), thresholdOf(ctx, self));
  });
}
