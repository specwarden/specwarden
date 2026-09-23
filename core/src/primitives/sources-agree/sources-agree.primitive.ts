import type { ICheck, ICheckContext, ICheckIdentity, IFinding } from '../../domain';
import { type ICorpusFloor, belowCorpusFloor, buildCheck, verdictFrom, withExaminedNote } from '../_shared';

export interface INamedSource {
  /** How this source is named in a finding. */
  readonly name: string;
  /** The set of names this source describes. */
  readonly extract: (ctx: ICheckContext) => readonly string[];
}

export interface ISourcesAgreeOptions extends ICheckIdentity {
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
  return buildCheck(options, ['read'], (ctx) => {
    const a = new Set(options.a.extract(ctx));
    const b = new Set(options.b.extract(ctx));
    const named = new Set([...a, ...b]).size;
    const short = belowCorpusFloor(
      options.id,
      named,
      options.corpus,
      `neither ${options.a.name} nor ${options.b.name} described a single name`,
      'name',
    );
    if (short) return short;

    const findings: IFinding[] = [];
    for (const name of a) {
      if (!b.has(name)) {
        findings.push({
          severity: 'error',
          message: `\`${name}\` is in ${options.a.name} but not ${options.b.name}.`,
          ruleId: options.id,
        });
      }
    }
    for (const name of b) {
      if (!a.has(name)) {
        findings.push({
          severity: 'error',
          message: `\`${name}\` is in ${options.b.name} but not ${options.a.name}.`,
          ruleId: options.id,
        });
      }
    }
    return verdictFrom(withExaminedNote(findings, options.id, named, 'name'));
  });
}
