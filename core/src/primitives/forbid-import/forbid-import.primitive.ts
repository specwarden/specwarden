import type { ICheck, ICheckIdentity, IFinding } from '../../domain';
import { IMPORT_RE, buildCheck, lineOf, matchesSpecifier, verdictFrom } from '../_shared';

export interface IForbidImportOptions extends ICheckIdentity {
  /** Glob of files the ban applies to. */
  readonly from: string;
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
    const findings: IFinding[] = [];
    for (const file of ctx.files.glob(options.from)) {
      if (exempt.has(file)) continue;
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
    return verdictFrom(findings, ctx.ratchet ?? options.ratchet);
  });
}
