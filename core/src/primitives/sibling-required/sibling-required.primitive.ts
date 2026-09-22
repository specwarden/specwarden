import type { ICheck, ICheckIdentity, IFinding } from '../../domain';
import { buildCheck, dirOf, joinDir, stem, verdictFrom } from '../_shared';

export interface ISiblingRequiredOptions extends ICheckIdentity {
  /**
   * Glob of the files that must have a sibling.
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
}

/**
 * A file of one shape requires a neighbour of another — the structure behind
 * `spec-placement` and `fe-test-placement`: a service has a spec beside it.
 */
export function siblingRequired(options: ISiblingRequiredOptions): ICheck {
  return buildCheck(options, ['read'], (ctx) => {
    const findings: IFinding[] = [];
    for (const file of ctx.files.glob(options.subjects)) {
      const sibling = joinDir(dirOf(file), options.require.replace('{name}', stem(file)));
      if (!ctx.files.exists(sibling)) {
        findings.push({
          severity: 'error',
          file,
          message: `${file} requires a sibling ${sibling}, which is missing.`,
          ruleId: options.id,
        });
      }
    }
    return verdictFrom(findings, ctx.ratchet ?? options.ratchet);
  });
}
