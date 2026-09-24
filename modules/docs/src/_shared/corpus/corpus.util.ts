import {
  type ICorpusFloor,
  type IFinding,
  type IThreshold,
  type IVcs,
  type IVerdict,
  type TOptionSpec,
  type TPathspecs,
  belowCorpusFloor,
  frameTolerated,
  satisfiesRatchet,
  withExaminedNote,
} from 'specwarden';

/**
 * The corpus a documentation check reads when it is not told otherwise: every tracked
 * markdown file. A pathspec over TRACKED files, so `node_modules/` and build output are
 * never part of it, and a root `README.md` always is.
 */
export const DEFAULT_DOCS = '**/*.md';

/**
 * The options every check here shares beside the engine's identity: the corpus by its role,
 * its exemptions, its floor — and `zone` refused, because a module's check speaks for the
 * package and a consumer's `zone` was accepted and then overwritten with `product`.
 */
export const DOCS_CORPUS_OPTIONS: TOptionSpec = {
  docs: { kind: ['string', 'array'], nonEmpty: true },
  except: { kind: 'array' },
  corpus: { kind: 'object' },
  zone: { refused: 'a module’s check speaks for its package, so its zone is always `product`' },
};

/** A corpus as a check reads it: the files left once `except` is applied, and how many the
 * pathspecs matched before it — so a refusal can say which of the two emptied it. */
export interface ICorpus {
  readonly files: readonly string[];
  readonly matched: number;
}

/**
 * The TRACKED files `files` selects, less every file an `except` pathspec selects, in path
 * order.
 *
 * Every check here names its corpus by its role (`docs`, `code`) and leaves files out with
 * `except`, read as git reads a pathspec. Four spellings did that job before — `skipDirs`
 * (a directory prefix), `skipped` (a RegExp over paths), `excludeCode` (a substring) and
 * `renderedSources` (a list) — and each check honoured only its own, so an archive left out
 * of one was read by the next.
 */
export function corpusOf(vcs: IVcs, files: TPathspecs, except: readonly string[] = []): ICorpus {
  const pathspecs = typeof files === 'string' ? [files] : files;
  const matched = [...new Set(pathspecs.flatMap((p) => vcs.trackedFiles(p)))];
  const exempt = new Set(except.flatMap((p) => vcs.trackedFiles(p)));
  return { files: matched.filter((f) => !exempt.has(f)).sort(), matched: matched.length };
}

/**
 * The verdict of a corpus below its floor — a FAILURE, never a clean run — or `undefined`
 * when the floor holds.
 *
 * A pathspec that matches nothing — a folder that moved, a glob with a typo, an `except`
 * that exempted everything — leaves a documentation check scanning zero documents and
 * finding zero defects. Reported as a pass, that is the check that cannot fail. The
 * refusal names the pathspec, and which of the two emptied it.
 */
export function refusedCorpus(
  id: string,
  files: TPathspecs,
  corpus: ICorpus,
  floor: ICorpusFloor | undefined,
  unit = 'document',
): IVerdict | undefined {
  const named = typeof files === 'string' ? `\`${files}\`` : files.map((f) => `\`${f}\``).join(', ');
  const why =
    corpus.matched > 0 && corpus.files.length === 0
      ? `${named} matched ${corpus.matched} file(s), and \`except\` exempted all of them`
      : `${named} matched nothing to read`;
  return belowCorpusFloor(id, corpus.files.length, floor, why, unit);
}

/** A check's findings in two classes: the ones a ratchet may tolerate, and the ones it never does. */
export interface IDebt {
  /** Always a failure, whatever the ratchet. */
  readonly hard: readonly IFinding[];
  /** Counted against the ratchet — the check's one measurement. */
  readonly soft: readonly IFinding[];
  /** Said, and never counted. */
  readonly notes?: readonly IFinding[];
}

/**
 * The verdict of a check with ONE ratchet over its soft findings.
 *
 * It holds while no hard finding exists and the soft count satisfies the bar this run is
 * held to — the stored threshold, else the declared ceiling (`thresholdOf`). And it STATES
 * the soft count as what it measured: two checks here counted their tolerated findings
 * without reporting them, so `--tighten` read zero error lines off a passing run, stored a
 * threshold of 0, and the next run failed over the debt the ratchet had been tolerating.
 */
export function debtVerdict(
  debt: IDebt,
  bar: IThreshold,
  pass: { readonly id: string; readonly examined: number; readonly unit?: string },
): IVerdict {
  const findings = withExaminedNote(
    [...debt.hard, ...debt.soft, ...(debt.notes ?? [])],
    pass.id,
    pass.examined,
    pass.unit,
  );
  const ok = debt.hard.length === 0 && satisfiesRatchet(debt.soft.length, bar.threshold, bar.direction);
  return { ...frameTolerated(ok, findings, `ratchet ${bar.threshold}`), measured: debt.soft.length };
}
