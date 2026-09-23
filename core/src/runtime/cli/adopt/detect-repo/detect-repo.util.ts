import type { IFileSource, IVcs } from '../../../../domain';

export type TPackageManager = 'pnpm' | 'npm' | 'yarn';
export type TTestRunner = 'vitest' | 'jest' | 'mocha' | 'node:test' | 'other';
export type TCi = 'github' | 'gitlab';
export type TSpecFramework = 'openspec' | 'speckit';

/** What `adopt` learns about a repository before it proposes anything. */
export interface IRepoShape {
  readonly packageManager?: TPackageManager;
  readonly workspaces: readonly string[];
  readonly testRunner?: TTestRunner;
  readonly hasAgentRouter: boolean;
  readonly docDirs: readonly string[];
  /**
   * The CI system, when there is one. A template wiring "every heavy gate has a job"
   * needs to know there IS a workflow to reconcile against — written blind, that check
   * reconciles a gate list against nothing and reports success.
   */
  readonly ci?: TCi;
  /** The spec framework in use, when the repository keeps its specs in one. */
  readonly specFramework?: TSpecFramework;
  /** Compose files found at the root, in the order docker itself would read them. */
  readonly composeFiles: readonly string[];
  /**
   * Whether there are shell scripts here at all.
   *
   * A check whose corpus is empty reports that it examined nothing, and correctly fails
   * — which on a fresh scaffold is a red first run caused by the scaffold rather than by
   * the repository. So the shell checks are written where there is shell.
   */
  readonly hasShellScripts: boolean;
  /**
   * The package directories the workspace globs MATCH — `packages/api`, not `packages/*`.
   * A glob is one line of configuration and says nothing about how many packages there are.
   */
  readonly workspacePackages: readonly string[];
  /** The `test` script, verbatim — named when the runner is none this knows by name. */
  readonly testScript?: string;
  /** The workflow files CI runs, the conventional `ci` one first. */
  readonly workflows: readonly string[];
  /** Reverse-proxy configs — a `Caddyfile`, an nginx `.conf` — in the order found. */
  readonly proxyConfigs: readonly string[];
  /** Env-file samples a repository commits for its compose stack — `.env.example`. */
  readonly envSamples: readonly string[];
}

/**
 * Read a repository's shape from its lockfile, manifest and layout. Pure over the
 * file port, so it runs against a real checkout or an in-memory tree identically.
 * Every field degrades to "unknown" rather than guessing — `adopt` reports what it
 * found, and a wrong guess there is worse than a blank.
 */
export function detectRepo(files: IFileSource, vcs?: IVcs): IRepoShape {
  // Asked the way a CHECK will ask it: tracked files where there is a VCS port, the disk
  // only as the fallback for a caller without one.
  // The disk, without a VCS, never includes an installed or built tree: a `.sh` inside
  // `node_modules/` was "this repository has shell scripts".
  const find = (glob: string): readonly string[] =>
    vcs
      ? vcs.trackedFiles(glob)
      : files.glob(glob).filter((f) => !/(^|\/)(node_modules|dist|build|coverage)\//.test(f));
  const workspaces = detectWorkspaces(files);
  return {
    packageManager: detectPackageManager(files),
    workspaces,
    workspacePackages: workspacePackages(workspaces, find),
    testScript: scriptsOf(files).test,
    workflows: detectWorkflows(find),
    proxyConfigs: unique(PROXY_GLOBS.flatMap(find)),
    envSamples: ENV_SAMPLES.filter((f) => files.exists(f)),
    testRunner: detectTestRunner(files, scriptsOf(files).test),
    hasAgentRouter: files.exists('AGENTS.md') || files.exists('CLAUDE.md'),
    docDirs: ['docs', 'doc'].filter((d) => files.isDirectory(d)),
    ci: detectCi(files),
    specFramework: detectSpecFramework(files),
    composeFiles: COMPOSE_CANDIDATES.filter((f) => files.exists(f)),
    hasShellScripts: SHELL_GLOBS.some((g) => find(g).length > 0),
  };
}

const unique = (list: readonly string[]): readonly string[] => [...new Set(list)];

/** Each workspace glob expanded to the directories holding a manifest; a negation excludes. */
function workspacePackages(globs: readonly string[], find: (glob: string) => readonly string[]): readonly string[] {
  const dirOf = (manifest: string) => manifest.slice(0, -'/package.json'.length);
  const matched = globs.filter((g) => !g.startsWith('!')).flatMap((g) => find(`${g.replace(/\/+$/, '')}/package.json`));
  const excluded = new Set(globs.filter((g) => g.startsWith('!')).flatMap((g) => find(`${g.slice(1)}/package.json`)));
  return [...unique(matched.filter((m) => !excluded.has(m)).map(dirOf))].sort();
}

function scriptsOf(files: IFileSource): Record<string, string> {
  try {
    const scripts = (JSON.parse(files.tryRead('package.json') ?? '{}') as { scripts?: unknown }).scripts;
    return typeof scripts === 'object' && scripts !== null ? (scripts as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** GitHub's workflows, `ci.yml` first because that is the one a gate-coverage check means. */
function detectWorkflows(find: (glob: string) => readonly string[]): readonly string[] {
  const github = unique([...find('.github/workflows/*.yml'), ...find('.github/workflows/*.yaml')])
    .slice()
    .sort();
  const conventional = github.filter((f) => /\/ci\.ya?ml$/.test(f));
  return unique([...conventional, ...github, ...find('.gitlab-ci.yml')]);
}

const PROXY_GLOBS = ['**/Caddyfile*', '**/nginx.conf', '**/nginx/**/*.conf'] as const;
const ENV_SAMPLES = ['.env.example', '.env.sample', '.env.template'] as const;

const SHELL_GLOBS = ['*.sh', 'scripts/**/*.sh', 'bin/**/*.sh', 'deploy/**/*.sh'] as const;

function detectCi(files: IFileSource): TCi | undefined {
  if (files.isDirectory('.github/workflows')) return 'github';
  if (files.exists('.gitlab-ci.yml')) return 'gitlab';
  return undefined;
}

/**
 * Which spec framework the repository keeps its specifications in.
 *
 * Both are recognised by their own directory, because that is the one thing each puts
 * in a repository that nothing else does. Neither is preferred: a repository using
 * both is told so by the caller rather than silently resolved here, since choosing for
 * someone is how a scaffold ends up wiring the framework they were migrating AWAY from.
 */
function detectSpecFramework(files: IFileSource): TSpecFramework | undefined {
  if (files.isDirectory('openspec')) return 'openspec';
  if (files.isDirectory('.specify') || files.isDirectory('specs')) return 'speckit';
  return undefined;
}

const COMPOSE_CANDIDATES = ['compose.yaml', 'compose.yml', 'docker-compose.yml', 'docker-compose.yaml'] as const;

function detectPackageManager(files: IFileSource): TPackageManager | undefined {
  if (files.exists('pnpm-lock.yaml')) return 'pnpm';
  if (files.exists('package-lock.json')) return 'npm';
  if (files.exists('yarn.lock')) return 'yarn';
  return undefined;
}

function detectWorkspaces(files: IFileSource): readonly string[] {
  const ws = files.tryRead('pnpm-workspace.yaml');
  if (ws !== undefined) {
    // Only the list items directly under `packages:` — NOT every `- item` in the
    // file (onlyBuiltDependencies is also a list, and would leak in). No YAML
    // dependency: collect list items after the `packages:` key until the next
    // top-level key. A comment or blank line inside the list does not end it.
    const lines = ws.split('\n');
    const start = lines.findIndex((l) => /^packages\s*:/.test(l));
    if (start === -1) return [];
    const out: string[] = [];
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^\S/.test(line)) break; // a new top-level key ends the list
      if (line.trim() === '' || line.trim().startsWith('#')) continue;
      const m = /^\s*-\s*["']?([^"'#\n]+?)["']?\s*$/.exec(line);
      if (m) out.push(m[1].trim());
    }
    return out;
  }
  const pkg = files.tryRead('package.json');
  if (pkg !== undefined) {
    try {
      const parsed = JSON.parse(pkg) as { workspaces?: readonly string[] | { packages?: readonly string[] } };
      const field = parsed.workspaces;
      if (Array.isArray(field)) return field;
      const nested = (field as { packages?: readonly string[] } | undefined)?.packages;
      if (Array.isArray(nested)) return nested;
    } catch {
      // a manifest that does not parse tells us nothing about workspaces
    }
  }
  return [];
}

/**
 * The test runner, from the manifest. `node --test` is Node's own runner and has no
 * dependency to find, so it is read from the `test` script: it was "other", the word for
 * a runner nobody could name, for the runner every Node install ships.
 */
function detectTestRunner(files: IFileSource, testScript: string | undefined): TTestRunner | undefined {
  const pkg = files.tryRead('package.json');
  if (pkg === undefined) return undefined;
  if (/["']vitest["']/.test(pkg)) return 'vitest';
  if (/["']jest["']/.test(pkg)) return 'jest';
  if (/["']mocha["']/.test(pkg)) return 'mocha';
  if (testScript !== undefined && /\bnode\b[^|&;]*\s--test\b/.test(testScript)) return 'node:test';
  return testScript !== undefined ? 'other' : undefined;
}
