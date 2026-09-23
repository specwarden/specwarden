import type { ICheck, ICheckContext, ICheckIdentity, IFinding } from '../../domain';
import { type ICorpusFloor, belowCorpusFloor, buildCheck, lineOf, verdictFrom, withExaminedNote } from '../_shared';

export interface IReferencesResolveOptions extends ICheckIdentity {
  /** Glob of files whose references are checked. */
  readonly in: string;
  /** How many files `in` must match for a verdict to count. Defaults to one: no file
   * means no reference, which resolved trivially and passed in silence. */
  readonly corpus?: ICorpusFloor;
  /** A global RegExp whose first capture group is the reference to resolve. */
  readonly extract: RegExp;
  /** Whether a reference resolves. Default: it names a file that exists. */
  readonly resolve?: (ref: string, ctx: ICheckContext) => boolean;
}

/**
 * References of a shape inside a set of files must resolve — `doc-paths`,
 * `doc-symbols`. A reference wrong a quarter of the time is worse than none: the
 * reader follows the dead one, finds nothing, and invents.
 */
export function referencesResolve(options: IReferencesResolveOptions): ICheck {
  const re = new RegExp(
    options.extract.source,
    options.extract.flags.includes('g') ? options.extract.flags : `${options.extract.flags}g`,
  );
  const resolves = options.resolve ?? ((ref, ctx) => ctx.files.exists(ref));
  return buildCheck(options, ['read'], (ctx) => {
    const files = ctx.files.glob(options.in);
    const short = belowCorpusFloor(
      options.id,
      files.length,
      options.corpus,
      `\`${options.in}\` matched nothing to read`,
    );
    if (short) return short;

    const findings: IFinding[] = [];
    for (const file of files) {
      const content = ctx.files.read(file);
      for (const m of content.matchAll(re)) {
        const ref = m[1];
        if (!resolves(ref, ctx)) {
          findings.push({
            severity: 'error',
            file,
            line: lineOf(content, m.index ?? 0),
            message: `${file} references \`${ref}\`, which does not resolve.`,
            ruleId: options.id,
          });
        }
      }
    }
    return verdictFrom(withExaminedNote(findings, options.id, files.length), ctx.ratchet ?? options.ratchet);
  });
}
