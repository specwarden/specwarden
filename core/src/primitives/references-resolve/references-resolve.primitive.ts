import type { ICheck, ICheckContext, ICheckIdentity, IFinding } from '../../domain';
import { buildCheck, lineOf, verdictFrom } from '../_shared';

export interface IReferencesResolveOptions extends ICheckIdentity {
  /** Glob of files whose references are checked. */
  readonly in: string;
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
  const re = new RegExp(options.extract.source, options.extract.flags.includes('g') ? options.extract.flags : `${options.extract.flags}g`);
  const resolves = options.resolve ?? ((ref, ctx) => ctx.files.exists(ref));
  return buildCheck(options, ['read'], (ctx) => {
    const findings: IFinding[] = [];
    for (const file of ctx.files.glob(options.in)) {
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
    return verdictFrom(findings, ctx.ratchet ?? options.ratchet);
  });
}
