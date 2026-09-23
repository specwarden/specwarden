import type { ICheck, ICheckDeclaration, IFinding } from '../../domain';
import { pathspecMatcher } from '../../infrastructure/git-vcs/git-pathspec/git-pathspec.util';
import {
  type ICorpusFloor,
  belowCorpusFloor,
  buildCheck,
  checkOptions,
  emptyCorpusReason,
  trackedCorpus,
  verdictFrom,
  withExaminedNote,
} from '../_shared';

export interface IPathContractOptions extends ICheckDeclaration {
  /** Pathspec identifying the kind of TRACKED file this contract governs. */
  readonly kind: string;
  /** The pathspecs a file of this kind may live under. Living outside all of them fails. */
  readonly allowedIn: readonly string[];
  /** How many files of `kind` must exist for a verdict to count. Defaults to one: a
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
    kind: { kind: 'string', required: true },
    allowedIn: { kind: 'array', required: true },
    corpus: { kind: 'object' },
  });
  const allowed = options.allowedIn.map((glob) => pathspecMatcher(glob));
  return buildCheck(options, ['read'], (ctx, self) => {
    const corpus = trackedCorpus(ctx.vcs, options.kind);
    const short = belowCorpusFloor(
      self.id,
      corpus.files.length,
      options.corpus,
      emptyCorpusReason(options.kind, corpus, 'hold to its contract'),
    );
    if (short) return short;

    const findings: IFinding[] = [];
    for (const file of corpus.files) {
      if (!allowed.some((matches) => matches(file))) {
        findings.push({
          severity: 'error',
          file,
          message: `${file} is of kind \`${options.kind}\` but lives outside its contract (${options.allowedIn.join(', ')}).`,
          ruleId: self.id,
        });
      }
    }
    return verdictFrom(withExaminedNote(findings, self.id, corpus.files.length), ctx.ratchet ?? options.ratchet);
  });
}
