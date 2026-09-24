import type { IFinding, IVerdict } from '../../../domain';

/**
 * The floor under a primitive's corpus: how many files it must have looked at before
 * its verdict means anything.
 */
export interface ICorpusFloor {
  /** Fewer files examined than this is a failure, not a pass. Defaults to 1. */
  readonly atLeast?: number;
  /** Why this many — printed with the refusal. */
  readonly why?: string;
}

/**
 * The verdict of a primitive whose corpus came back short — a FAILURE, never a pass.
 *
 * `forbidPattern`, `forbidImport`, `referencesResolve`, `sourcesAgree` and `zoneBoundary`
 * all passed in silence over a glob that matched nothing. A ban over zero files bans
 * nothing; two empty sources "agree"; a barrier sweeping no source is not a barrier. Each
 * exited green, and each is the primitive a consumer reached for INSTEAD of writing a
 * check whose corpus they would have had to declare — so the product's central defect
 * had moved into the very things sold as the cure for it.
 *
 * Returns `undefined` when the floor holds. `atLeast: 0` is how a consumer says, in
 * writing, that an empty corpus is expected here.
 */
export function belowCorpusFloor(
  ruleId: string,
  examined: number,
  floor: ICorpusFloor | undefined,
  what: string,
  unit = 'file',
): IVerdict | undefined {
  const atLeast = floor?.atLeast ?? 1;
  if (examined >= atLeast) return undefined;
  return {
    ok: false,
    findings: [
      {
        severity: 'error',
        ruleId,
        message:
          `examined ${examined} ${unit}(s) — ${what} — below the floor of ${atLeast}. ` +
          (floor?.why ??
            'A check that examined nothing cannot fail, so it reports success; this is that state, caught. ' +
              'Point the pathspec at where the files are, or declare `corpus: { atLeast: 0 }` if an empty set is expected.'),
      },
    ],
    measured: 0,
  };
}

/** The line a clean pass prints, so an empty corpus is visible even where no floor
 * would have caught it: "✓ id — 12 file(s) examined, clean". */
export function examinedNote(ruleId: string, examined: number, unit = 'file'): IFinding {
  return { severity: 'info', message: `✓ ${ruleId} — ${examined} ${unit}(s) examined, clean` };
}

/**
 * `findings`, with the examined-count note in front when there is nothing else to show —
 * the convention `defineCheck` follows. A failing verdict keeps its first finding the
 * failure, which is what a reader (and a spec) reaches for first.
 */
export function withExaminedNote(
  findings: readonly IFinding[],
  ruleId: string,
  examined: number,
  unit = 'file',
): IFinding[] {
  return findings.some((f) => f.severity === 'error')
    ? [...findings]
    : [examinedNote(ruleId, examined, unit), ...findings];
}
