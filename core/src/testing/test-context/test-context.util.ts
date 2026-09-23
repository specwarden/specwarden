import type {
  ICheck,
  ICheckContext,
  ICheckMeta,
  IClock,
  IFileWriter,
  IProcessOptions,
  IProcessResult,
  IProcessRunner,
  IVcs,
  IVerdict,
} from '../../domain';
import { InMemoryFileSource } from '../../infrastructure';
import { matchPathspec } from '../../infrastructure/git-vcs/git-pathspec/git-pathspec.util';

/**
 * A check context for a test, with every port answered or honestly refused.
 *
 * WHY THIS SHIPS WITH THE ENGINE. The whole argument for ports is that a check can
 * be run against a constructed tree instead of a checkout. Measured over a corpus
 * of real check tests, that argument was not reaching anyone: of 23 tests written for check
 * bodies, ZERO imported anything from the engine. They built duck-typed literals
 * instead — `check.run({ files: { tryRead: () => undefined } })` — which work only
 * while the body happens to touch exactly the method the literal defines, and fail
 * with an unreadable `x is not a function` the moment it reaches for a second one.
 * A tool whose central promise is testability has to make the test the easy path.
 *
 * WHAT AN UNCONFIGURED PORT DOES: it throws, by name, saying which port was reached
 * for and which option supplies it. That is the behaviour the duck-typed literal was
 * already giving, minus the part where nobody could tell what had happened — and it
 * is deliberately not a silent default, because a fake that quietly answers "no
 * files" turns a test of a check into a test of an empty repository.
 */

/** Thrown when a check reaches for a port the test did not set up. */
export class MissingTestPortError extends Error {
  override readonly name = 'MissingTestPortError';
  constructor(port: string, method: string, option: string) {
    super(
      `the check called ${port}.${method}(), and this test context has no ${port}. ` +
        `Pass \`${option}\` to testContext() — a port left unset throws rather than answering, ` +
        `so a test cannot pass by accident against a world that was never described.`,
    );
  }
}

export interface ITestContextOptions {
  /** The tree the check reads, as repository-relative path → contents. */
  readonly tree?: Readonly<Record<string, string>>;
  /** The root the in-memory source reports. Rarely matters; a check reading it is a
   * check that has learned something about the machine it runs on. */
  readonly root?: string;
  /** The changed set this run is filtering against. */
  readonly changed?: readonly string[];
  /** What version control reports as tracked. A list, or a function when the test
   * needs different answers per pathspec. Unset means every file in `tree`. */
  readonly tracked?: readonly string[] | ((pathspec?: string) => readonly string[]);
  /** Branch names this checkout can resolve; `null` for "cannot tell", which a check
   * must treat as a reason to skip rather than a verdict. */
  readonly branches?: readonly string[] | null;
  readonly currentBranch?: string;
  /** The stored ratchet threshold this check would receive. */
  readonly ratchet?: number;
  readonly shard?: string;
  /** The manifest the check sees through `ctx.roster()`. */
  readonly roster?: readonly ICheckMeta[];
  /** What a subprocess returns. Unset means the check may not shell out. */
  readonly exec?: (command: string, args: readonly string[], options?: IProcessOptions) => IProcessResult;
  /** Pinned wall-clock time, so a date-sensitive check is not racing the calendar. */
  readonly now?: Date;
}

/** The context, plus the two things a test wants to inspect afterwards. */
export interface ITestContext extends ICheckContext {
  /** Everything the check wrote, path → contents. Empty unless it declared `write`
   * and actually wrote. */
  readonly writes: ReadonlyMap<string, string>;
  /** Every command the check spawned, in order. */
  readonly commands: readonly { command: string; args: readonly string[] }[];
}

function fakeVcs(options: ITestContextOptions, everyFile: readonly string[]): IVcs {
  const tracked = options.tracked;
  return {
    refExists: (ref) => (options.branches ?? []).includes(ref),
    remoteBranches: () => options.branches ?? [],
    branchNames: () => (options.branches === null ? undefined : (options.branches ?? [])),
    currentBranch: () => options.currentBranch,
    changedFiles: () => options.changed ?? [],
    changedLineCount: () => undefined,
    trackedFiles: (pathspec) => {
      if (typeof tracked === 'function') return tracked(pathspec);
      // A tracked LIST is filtered by the pathspec, the way git filters the index. It was
      // returned whole, whatever was asked — so a check handed `docs/*.md` got the
      // package manifests too, and no test written with an explicit list ever exercised
      // the check's own choice of files.
      //
      // The default is the tree itself: a test that says nothing about version control
      // usually means "the tree is the repository".
      //
      // Both go through `pathspecMatcher`, the one reading the real adapter is held to.
      // An EMPTY pathspec is "every tracked file" there — the trap this kit once fell
      // into, forwarding it to a glob that matched nothing, so a credential scan passed
      // over a tree with a credential in it.
      return matchPathspec(pathspec, tracked ?? everyFile);
    },
  };
}

/**
 * Build a check context over a described world.
 *
 * Everything is optional. The minimum useful call is `testContext({ tree: { … } })`,
 * which answers reads and listings, reports the whole tree as tracked, and refuses
 * anything else by name.
 */
export function testContext(options: ITestContextOptions = {}): ITestContext {
  const files = new InMemoryFileSource(options.tree ?? {}, options.root ?? '/test');
  const writes = new Map<string, string>();
  const commands: { command: string; args: readonly string[] }[] = [];

  const writer: IFileWriter = {
    write: (path, content) => {
      writes.set(path, content);
    },
  };

  const proc: IProcessRunner = {
    run: (command, args, runOptions) => {
      commands.push({ command, args });
      if (options.exec === undefined) throw new MissingTestPortError('proc', 'run', 'exec');
      return options.exec(command, args, runOptions);
    },
  };

  const at = options.now;
  const clock: IClock = {
    now: () => {
      if (at === undefined) throw new MissingTestPortError('clock', 'now', 'now');
      return at;
    },
    monotonicMs: () => 0,
  };

  return {
    changed: options.changed ?? [],
    shard: options.shard,
    ratchet: options.ratchet,
    roster: () => options.roster ?? [],
    files,
    // EVERY file in the tree, dotfiles included: git tracks a `.env` like anything else,
    // and the file source's glob — which skips dotfiles, as `fs.globSync` does — is the
    // wrong engine to ask what the index holds.
    vcs: fakeVcs(
      options,
      Object.keys(options.tree ?? {}).map((p) => p.replace(/\\/g, '/').replace(/^\.?\//, '')),
    ),
    proc,
    clock,
    writer,
    writes,
    commands,
  };
}

/**
 * Run a check against a described world and return its verdict.
 *
 * The obvious convenience, and one correctness point that is not obvious: it awaits.
 * A check may be async, and `check.run(ctx)` without an await returns a Promise whose
 * `ok` is `undefined` — which is falsy, so an assertion that the check FAILED passes
 * against a check that was never waited for.
 */
export async function runCheck(check: ICheck, options: ITestContextOptions = {}): Promise<IVerdict> {
  return check.run(testContext(options));
}

/** The error findings of a verdict — the assertion most check tests actually want,
 * with the info lines a passing run prints filtered out of the way. */
export function errorsOf(verdict: IVerdict): readonly string[] {
  return verdict.findings.filter((f) => f.severity === 'error').map((f) => f.message);
}
