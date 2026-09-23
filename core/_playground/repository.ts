import {
  CheckRegistry,
  CheckRunner,
  type ICheck,
  type ICheckResult,
  type IEngineAdapters,
  type IReporter,
  InMemoryFileSource,
  type IVcs,
  SystemClock,
  testContext,
} from 'specwarden';

/**
 * The engine, assembled the way a host assembles it.
 *
 * WHAT THIS FILE IS FOR. Every other package's playground wires checks THROUGH the
 * engine. This one wires the engine itself: a registry, the six adapters, a reporter, and
 * the runner that decides which checks run and what the process exits with. A consumer's
 * CLI is these five lines plus argument parsing, so anything that breaks here breaks the
 * first run of every repository that installs this.
 *
 * Nothing is mocked with a duck-typed literal. The file source is the engine's own
 * in-memory adapter, the clock is the real one, and the ratchet store is the smallest
 * honest implementation of its port — because a fake that quietly answers "no files" or
 * "no threshold" turns a test of the engine into a test of an empty repository.
 */

/** A repository, described. */
export const TREE: Record<string, string> = {
  'README.md': '# a repository\n',
  'src/index.ts': "export { thing } from './thing';\n",
  'src/thing.ts': 'export const thing = 1;\n',
  'docs/GUIDE.md': '# guide\n',
};

/** What version control answers. `changed` is the set a run filters relevance against. */
export function vcs(changed: readonly string[] | undefined, tracked: readonly string[] = Object.keys(TREE)): IVcs {
  return {
    refExists: () => true,
    remoteBranches: () => [],
    branchNames: () => [],
    currentBranch: () => 'main',
    // `undefined` is "cannot tell", and the engine must read it as a reason to run
    // EVERYTHING. Read as "nothing changed" it would skip the entire tier, silently, on
    // exactly the checkouts where the diff could not be computed.
    changedFiles: () => changed as readonly string[],
    changedLineCount: () => changed?.length,
    // Filtered by the pathspec, the way git filters it — the test kit's reading, which the
    // VCS contract spec holds to git's. It returned every tracked file for any pathspec, so
    // a primitive's `except` "exempted" files the pathspec never matched.
    trackedFiles: (pathspec?: string) => testContext({ tracked }).vcs.trackedFiles(pathspec),
  };
}

/** A ratchet store that keeps thresholds in memory and records what was written. */
export function ratchetStore(initial: Record<string, number> = {}) {
  const values = new Map(Object.entries(initial));
  const writes: { id: string; value: number }[] = [];
  return {
    values,
    writes,
    port: {
      read: (id: string) => (values.has(id) ? { id, value: values.get(id)! } : undefined),
      establish: (id: string, value: number) => {
        values.set(id, value);
        writes.push({ id, value });
        return { id, value };
      },
      tighten: (id: string, value: number) => {
        values.set(id, value);
        writes.push({ id, value });
        return { id, value };
      },
    },
  };
}

/** A reporter that keeps what it was told, so a test reads the run rather than stdout. */
export function recordingReporter() {
  const results: ICheckResult[] = [];
  const started: string[] = [];
  const reporter: IReporter = {
    checkStarted: (meta) => void started.push(meta.id),
    checkFinished: (result) => void results.push(result),
    runFinished: () => {},
  };
  return { reporter, results, started };
}

export interface IEngineHarness {
  readonly run: CheckRunner['run'];
  readonly results: ICheckResult[];
  readonly started: string[];
  readonly ratchets: ReturnType<typeof ratchetStore>;
  readonly commands: { command: string; args: readonly string[] }[];
}

/**
 * Assemble the engine over a described repository and hand back its run function.
 *
 * This is the whole wiring a host does, in one place, so a playground test reads as
 * "given this repository and these checks, the run did X" rather than as setup.
 */
export function engine(
  checks: readonly ICheck[],
  options: {
    tree?: Record<string, string>;
    changed?: readonly string[];
    tracked?: readonly string[];
    ratchets?: Record<string, number>;
    exec?: (command: string, args: readonly string[]) => { status: number; stdout: string; stderr: string };
  } = {},
): IEngineHarness {
  const registry = new CheckRegistry();
  registry.registerAll(checks);

  const store = ratchetStore(options.ratchets);
  const { reporter, results, started } = recordingReporter();
  const commands: { command: string; args: readonly string[] }[] = [];

  const adapters: IEngineAdapters = {
    files: new InMemoryFileSource(options.tree ?? TREE, ''),
    vcs: vcs(options.changed, options.tracked ?? Object.keys(options.tree ?? TREE)),
    proc: {
      run: (command, args) => {
        commands.push({ command, args });
        return options.exec?.(command, args) ?? { status: 0, stdout: '', stderr: '' };
      },
    },
    clock: new SystemClock(),
    writer: { write: () => {} },
    ratchets: store.port,
  };

  const runner = new CheckRunner(registry, adapters, reporter);

  return { run: runner.run.bind(runner), results, started, ratchets: store, commands };
}
