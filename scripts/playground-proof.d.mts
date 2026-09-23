/**
 * Types for `playground-proof.mjs`, so a template's playground — which is part of that
 * package's TypeScript program — can import it without an implicit `any`.
 */

/** One defect a repository can carry, and what its check must say about it. */
export interface IDefect {
  /** What the defect is, in a phrase — it completes "goes red over …". */
  readonly why: string;
  /** Path → new contents, or `null` to delete the file or directory. Applied to a scratch copy only. */
  readonly edits: Readonly<Record<string, string | null>>;
  /** A fragment the check's finding must contain: the thing that was planted. */
  readonly says: string;
}

/** The runner the spec already imported — handed in, so the scenes register with it. */
export interface IRunner {
  readonly describe: typeof import('vitest').describe;
  readonly it: typeof import('vitest').it;
  readonly expect: typeof import('vitest').expect;
  readonly beforeAll: typeof import('vitest').beforeAll;
  readonly afterAll: typeof import('vitest').afterAll;
}

/** Declare the playground's scenes: green as scaffolded, and each defect red alone. */
/** What the scratch repository needs beyond its files. */
export interface IPlaygroundSetup {
  /** Branches that exist in the scratch checkout — what an active plan's branch resolves to. */
  readonly branches?: readonly string[];
}

export function provePlayground(
  slug: string,
  defects: Readonly<Record<string, IDefect>>,
  runner: IRunner,
  setup?: IPlaygroundSetup,
): void;

/** What a spec's own scene gets: the scratch directory, and the CLI run inside it. */
export interface IScratchScene {
  readonly dir: string;
  readonly warden: (
    args: readonly string[],
    options?: { readonly input?: string; readonly timeoutSec?: number },
  ) => { readonly status: number | null; readonly stdout: string; readonly stderr: string };
}

/** Run one scene of the spec's own over a scratch copy of the template's repository. */
export function inScratchRepository<T>(
  slug: string,
  setup: { readonly edits?: Readonly<Record<string, string | null>>; readonly branches?: readonly string[] },
  scene: (scratch: IScratchScene) => T,
): T;

/** `text` with `from` replaced by `to`; throws when `from` is absent, so a defect cannot be planted as a no-op. */
export function planted(text: string, from: string, to: string): string;
