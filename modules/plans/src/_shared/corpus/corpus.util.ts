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

/** Where plans live when a repository does not say — the folder the scaffolds write. */
export const DEFAULT_PLANS_DIR = 'docs/_plans';

/** Where a harvested plan goes when a repository does not say. OUTSIDE the plans folder,
 * because plans are flat and a folder inside it is a hard failure. */
export const DEFAULT_ARCHIVE_DIR = 'docs/_plans-archive';

/**
 * The options every check here shares beside the engine's identity: its exemptions, its
 * floor — and `zone` refused, because a module's check speaks for the package and a
 * consumer's `zone` was accepted and then overwritten with `product`.
 */
export const PLANS_SHARED_OPTIONS: TOptionSpec = {
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

/** The TRACKED files `files` selects, less every file an `except` pathspec selects, in path order. */
export function corpusOf(vcs: IVcs, files: TPathspecs, except: readonly string[] = []): ICorpus {
  const pathspecs = typeof files === 'string' ? [files] : files;
  const matched = [...new Set(pathspecs.flatMap((p) => vcs.trackedFiles(p)))];
  const exempt = new Set(except.flatMap((p) => vcs.trackedFiles(p)));
  return { files: matched.filter((f) => !exempt.has(f)).sort(), matched: matched.length };
}

/**
 * Whether `except` leaves out a path the plans folder LISTED — which may be untracked, since
 * a new plan is checked before it is committed. A literal pathspec names the file or the
 * directory holding it; a glob is read as git reads it, over the tracked files.
 */
export function isExempt(vcs: IVcs, except: readonly string[], path: string): boolean {
  return except.some((spec) => {
    const literal = spec.replace(/\/+$/, '');
    return path === literal || path.startsWith(`${literal}/`) || vcs.trackedFiles(spec).includes(path);
  });
}

/** The verdict of a pathspec corpus below its floor — a FAILURE, never a clean run — or
 * `undefined` when the floor holds. It names the pathspec, and which of the two emptied it. */
export function refusedCorpus(
  id: string,
  files: TPathspecs,
  corpus: ICorpus,
  floor: ICorpusFloor | undefined,
): IVerdict | undefined {
  const named = typeof files === 'string' ? `\`${files}\`` : files.map((f) => `\`${f}\``).join(', ');
  const why =
    corpus.matched > 0 && corpus.files.length === 0
      ? `${named} matched ${corpus.matched} file(s), and \`except\` exempted all of them`
      : `${named} matched nothing to read`;
  return belowCorpusFloor(id, corpus.files.length, floor, why, 'document');
}

/**
 * The floor under a plans folder's plans: none by default. The folder itself must exist —
 * `plansFolder` refuses one that does not — but a folder holding no plan is the honest
 * state of a repository between pieces of work, and a check red over it would be switched
 * off by the first team that finished everything. `corpus: { atLeast: 1 }` says otherwise.
 */
export function refusedPlans(
  id: string,
  plans: number,
  dir: string,
  floor: ICorpusFloor | undefined,
): IVerdict | undefined {
  return belowCorpusFloor(id, plans, floor ?? { atLeast: 0 }, `${dir} holds ${plans} plan(s)`, 'plan');
}

/** A check's findings in two classes: the ones a ratchet may tolerate, and the ones it never does. */
export interface IDebt {
  /** Always a failure, whatever the ratchet. */
  readonly hard: readonly IFinding[];
  /** Counted against the ratchet — the check's one measurement. */
  readonly soft: readonly IFinding[];
  /** Said, and never counted. */
  readonly notes: readonly IFinding[];
}

/**
 * The verdict of a check with ONE ratchet over its soft findings: it holds while no hard
 * finding exists and the soft count satisfies the bar this run is held to — the stored
 * threshold, else the declared ceiling — and it STATES the soft count as what it measured,
 * so `--tighten` records the debt the check tolerated rather than the zero error lines a
 * summary-only verdict used to show it.
 */
export function debtVerdict(
  debt: IDebt,
  bar: IThreshold,
  pass: { readonly id: string; readonly examined: number; readonly unit: string },
): IVerdict {
  const findings = withExaminedNote([...debt.hard, ...debt.soft, ...debt.notes], pass.id, pass.examined, pass.unit);
  const ok = debt.hard.length === 0 && satisfiesRatchet(debt.soft.length, bar.threshold, bar.direction);
  return { ...frameTolerated(ok, findings, `ratchet ${bar.threshold}`), measured: debt.soft.length };
}
