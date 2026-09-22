import type { IFileSource } from '../../../../domain';
import { dirOf, joinDir, stem } from '../../../../primitives/_shared';

export interface ISiblingInference {
  readonly when: string;
  readonly require: string;
  readonly total: number;
  readonly satisfied: number;
  /** satisfied / total, in [0, 1]; 0 when nothing matched. */
  readonly ratio: number;
  /** The files that DON'T have the sibling — always shown, never hidden, so a
   * coincidence is not mistaken for a convention. */
  readonly exceptions: readonly string[];
}

/**
 * Measure how consistently files matching `when` have the sibling `require`
 * describes. This is what turns "author a rule" into "confirm a rule": a team's
 * existing habit, measured, becomes a `siblingRequired(...)` with its ratchet set
 * to the current exceptions — proposed, never enabled on its own.
 */
export function inferSibling(files: IFileSource, when: string, require: string): ISiblingInference {
  const matched = files.glob(when);
  const exceptions = matched.filter(
    (file) => !files.exists(joinDir(dirOf(file), require.replace('{name}', stem(file)))),
  );
  const satisfied = matched.length - exceptions.length;
  return {
    when,
    require,
    total: matched.length,
    satisfied,
    ratio: matched.length === 0 ? 0 : satisfied / matched.length,
    exceptions,
  };
}
