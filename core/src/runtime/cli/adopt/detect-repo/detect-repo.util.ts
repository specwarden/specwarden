import type { IFileSource, IVcs } from '../../../../domain';

export type TPackageManager = 'pnpm' | 'npm' | 'yarn';
export type TTestRunner = 'vitest' | 'jest' | 'other';
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
}

/**
 * Read a repository's shape from its lockfile, manifest and layout. Pure over the
 * file port, so it runs against a real checkout or an in-memory tree identically.
 * Every field degrades to "unknown" rather than guessing — `adopt` reports what it
 * found, and a wrong guess there is worse than a blank.
 */
export function detectRepo(files: IFileSource, vcs?: IVcs): IRepoShape {
  return {
    packageManager: detectPackageManager(files),
    workspaces: detectWorkspaces(files),
    testRunner: detectTestRunner(files),
    hasAgentRouter: files.exists('AGENTS.md') || files.exists('CLAUDE.md'),
    docDirs: ['docs', 'doc'].filter((d) => files.isDirectory(d)),
    ci: detectCi(files),
    specFramework: detectSpecFramework(files),
    composeFiles: COMPOSE_CANDIDATES.filter((f) => files.exists(f)),
    hasShellScripts: detectShellScripts(files, vcs),
  };
}

/**
 * Whether there is shell to check — asked the way the CHECK will ask it.
 *
 * A check reads TRACKED files, so detection must too. Reading the filesystem instead
 * finds the scripts of a repository whose first commit has not happened yet, writes the
 * check, and the check then correctly reports that it examined nothing — a red first
 * run caused by the scaffold rather than by the repository. Detection and enforcement
 * disagreeing about the same question is a defect wherever it appears; here it is a
 * one-line fix, and the filesystem stays the fallback for a caller with no VCS port.
 */
function detectShellScripts(files: IFileSource, vcs?: IVcs): boolean {
  if (vcs) return SHELL_GLOBS.some((g) => vcs.trackedFiles(g).length > 0);
  return SHELL_GLOBS.some((g) => files.glob(g).length > 0);
}

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

function detectTestRunner(files: IFileSource): TTestRunner | undefined {
  const pkg = files.tryRead('package.json');
  if (pkg === undefined) return undefined;
  if (/["']vitest["']/.test(pkg)) return 'vitest';
  if (/["']jest["']/.test(pkg)) return 'jest';
  return /"test"\s*:/.test(pkg) ? 'other' : undefined;
}
