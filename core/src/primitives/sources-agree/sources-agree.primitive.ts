import type { ICheck, ICheckContext, ICheckDeclaration, IFinding } from '../../domain';
import {
  CheckOptionsError,
  type ICorpusFloor,
  belowCorpusFloor,
  buildCheck,
  checkOptions,
  thresholdOf,
  verdictFrom,
  withExaminedNote,
} from '../_shared';

export interface INamedSource {
  /** How this source is named in a finding. */
  readonly name: string;
  /** The set of names this source describes. */
  readonly extract: (ctx: ICheckContext) => readonly string[];
  /** The file a name missing from this source should be added to — where a finding
   * points. Absent, the `name` itself when it is a file that exists. */
  readonly file?: string;
}

export interface ISourcesAgreeOptions extends ICheckDeclaration {
  readonly a: INamedSource;
  readonly b: INamedSource;
  /** How many names the two sources must describe between them for agreement to count.
   * Defaults to one: two empty sets agree about nothing, and an extractor that stopped
   * matching turned every comparison into that agreement, in silence. */
  readonly corpus?: ICorpusFloor;
}

/**
 * Two sources describe the same set — a compose file and a
 * shell table, say, which must list the same services. A member present in one and missing from
 * the other is silent on a running system until it is not.
 */
export function sourcesAgree(options: ISourcesAgreeOptions): ICheck {
  checkOptions('sourcesAgree', options, {
    a: { kind: 'object', required: true },
    b: { kind: 'object', required: true },
    corpus: { kind: 'object' },
  });
  for (const side of ['a', 'b'] as const) {
    const source: Partial<INamedSource> = options[side];
    if (typeof source.name !== 'string' || typeof source.extract !== 'function') {
      throw new CheckOptionsError(
        `sourcesAgree${options.id ? ` '${options.id}'` : ''}: \`${side}\` must be { name: string, extract: (ctx) => string[] }.`,
      );
    }
  }
  return buildCheck(options, ['read'], (ctx, self) => {
    const a = new Set(options.a.extract(ctx));
    const b = new Set(options.b.extract(ctx));
    const named = new Set([...a, ...b]).size;
    const short = belowCorpusFloor(
      self.id,
      named,
      options.corpus,
      `neither ${options.a.name} nor ${options.b.name} described a single name`,
      'name',
    );
    if (short) return short;

    // A finding says WHERE: the file that lacks the name. It carried no file, so an
    // editor or a diff annotation had nothing to open.
    const fileOf = (source: INamedSource): string | undefined =>
      source.file ?? (ctx.files.exists(source.name) ? source.name : undefined);
    const [fileA, fileB] = [fileOf(options.a), fileOf(options.b)];
    const findings: IFinding[] = [];
    for (const name of a) {
      if (!b.has(name)) {
        findings.push({
          severity: 'error',
          message: `\`${name}\` is in ${options.a.name} but not ${options.b.name}.`,
          ...(fileB === undefined ? {} : { file: fileB }),
        });
      }
    }
    for (const name of b) {
      if (!a.has(name)) {
        findings.push({
          severity: 'error',
          message: `\`${name}\` is in ${options.b.name} but not ${options.a.name}.`,
          ...(fileA === undefined ? {} : { file: fileA }),
        });
      }
    }
    // The tolerance every other primitive gives; it was accepted on the identity and ignored.
    return verdictFrom(withExaminedNote(findings, self.id, named, 'name'), thresholdOf(ctx, self));
  });
}
