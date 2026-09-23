import type { ICheck, ICheckIdentity, IFinding } from '../../domain';
import {
  type ICorpusFloor,
  IMPORT_RE,
  belowCorpusFloor,
  buildCheck,
  withExaminedNote,
  lineOf,
  matchesSpecifier,
  verdictFrom,
} from '../_shared';

export interface IForbidImportOptions extends ICheckIdentity {
  /** Glob of files the ban applies to. */
  readonly from: string;
  /** How many files `from` must match for a verdict to count. Defaults to one: a ban
   * over zero files bans nothing, and it passed in silence before this existed. */
  readonly corpus?: ICorpusFloor;
  /** The forbidden module: a string (exact, or a prefix when followed by `/`) or a
   * RegExp tested against the import specifier. */
  readonly to: string | RegExp;
  /** Globs whose files are exempt (e.g. the one layer allowed to import it). */
  readonly except?: readonly string[];
}

/**
 * Code under A must not import B, save for an allowed exception C — the database
 * barrier and the FE layering rule. The rule is the compiler, not a convention.
 */
export function forbidImport(options: IForbidImportOptions): ICheck {
  return buildCheck(options, ['read'], (ctx) => {
    const exempt = new Set((options.except ?? []).flatMap((g) => ctx.files.glob(g)));
    const files = ctx.files.glob(options.from).filter((file) => !exempt.has(file));
    const short = belowCorpusFloor(
      options.id,
      files.length,
      options.corpus,
      `\`${options.from}\` matched nothing to scan`,
    );
    if (short) return short;

    const findings: IFinding[] = [];
    for (const file of files) {
      const content = ctx.files.read(file);
      for (const m of content.matchAll(IMPORT_RE)) {
        if (matchesSpecifier(m[1], options.to)) {
          findings.push({
            severity: 'error',
            file,
            line: lineOf(content, m.index ?? 0),
            message: `${file} imports \`${m[1]}\`, which is forbidden from ${options.from}.`,
            ruleId: options.id,
          });
        }
      }
    }
    return verdictFrom(withExaminedNote(findings, options.id, files.length), ctx.ratchet ?? options.ratchet);
  });
}
