import type { ICheck, ICheckDeclaration, IFinding } from '../../domain';
import {
  CheckOptionsError,
  type ICorpusFloor,
  belowCorpusFloor,
  buildCheck,
  checkOptions,
  emptyCorpusReason,
  testStateless,
  trackedCorpus,
  verdictFrom,
  withExaminedNote,
} from '../_shared';

export interface IMustDeclareField {
  readonly name: string;
  /** The pattern whose presence proves the field is declared. */
  readonly pattern: RegExp;
}

export interface IMustDeclareOptions extends ICheckDeclaration {
  /** Pathspec of the TRACKED files that must carry the declarations. */
  readonly files: string;
  readonly fields: readonly IMustDeclareField[];
  /** How many files must be read for a verdict to count. Defaults to one: no file
   * declared nothing wrong, and it passed in silence — with a `corpus` handed to it
   * dropped, because the factory did not take one. */
  readonly corpus?: ICorpusFloor;
}

/**
 * Files of a kind must declare certain fields — `e2e-manifest` (tier/touches/
 * requires) and `agent-definitions` (name/description/tools/model). A missing field
 * is invisible until the thing it governs behaves wrong; this makes it a red gate.
 */
export function mustDeclare(options: IMustDeclareOptions): ICheck {
  checkOptions('mustDeclare', options, {
    files: { kind: 'string', required: true },
    fields: { kind: 'array', required: true },
    corpus: { kind: 'object' },
  });
  options.fields.forEach((field: Partial<IMustDeclareField>, i) => {
    if (typeof field?.name !== 'string' || !(field.pattern instanceof RegExp)) {
      throw new CheckOptionsError(
        `mustDeclare${options.id ? ` '${options.id}'` : ''}: \`fields[${i}]\` must be { name: string, pattern: RegExp }` +
          ` — a string pattern cannot be tested, and a field that is never tested is declared by every file.`,
      );
    }
  });
  return buildCheck(options, ['read'], (ctx, self) => {
    const corpus = trackedCorpus(ctx.vcs, options.files);
    const short = belowCorpusFloor(
      self.id,
      corpus.files.length,
      options.corpus,
      emptyCorpusReason(options.files, corpus, 'read'),
    );
    if (short) return short;

    const findings: IFinding[] = [];
    let examined = 0;
    for (const file of corpus.files) {
      const content = ctx.files.tryRead(file);
      if (content === undefined) continue;
      examined++;
      for (const field of options.fields) {
        if (!testStateless(field.pattern, content)) {
          findings.push({
            severity: 'error',
            file,
            message: `${file} does not declare \`${field.name}\`.`,
            ruleId: self.id,
          });
        }
      }
    }
    return verdictFrom(withExaminedNote(findings, self.id, examined), ctx.ratchet ?? options.ratchet);
  });
}
