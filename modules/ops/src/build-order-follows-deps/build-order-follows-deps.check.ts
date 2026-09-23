import { type ICheck, type IFinding, type IVerdict, buildCheck, checkOptions } from 'specwarden';
import type { IOpsCheckIdentity } from '../_shared/identity/identity.model';

/**
 * A container build compiles a workspace package only AFTER the workspace packages it
 * imports.
 *
 * THE DEFECT. A monorepo package is compiled against its dependency's BUILD OUTPUT, and in
 * a clean image that output does not exist until something produces it. Build them in the
 * wrong order and the compiler resolves the dependency to nothing — a failure that appears
 * only in the image, never locally, because a developer's tree already holds every
 * dependency's `dist` from the last full build.
 *
 * WHY IT READS THE MANIFESTS RATHER THAN A LIST. The dependency graph is already declared,
 * once, in the packages' own manifests. Writing "i18n before contracts" beside the check
 * would be a SECOND declaration of it, free to drift the day a third package appears —
 * which is the class of defect the check exists for.
 *
 * WHY LINE ORDER IS EXECUTION ORDER. `RUN a && RUN b` and two `RUN` lines both execute top
 * to bottom, and a `&&` chain within one line does too. Reading the file in order therefore
 * reads the execution order, whichever form the host writes.
 *
 * WHAT IS CONFIGURATION: which directory holds the packages, what a workspace package's
 * name looks like, how a build invocation appears in the container file, and which files
 * are container files. None of that is a fact about the rule.
 */

export interface IBuildOrderOptions extends IOpsCheckIdentity {
  /** Where the workspace packages live, repo-relative. */
  readonly packagesDir: string;
  /** A workspace package's name prefix — `@scope/`. Anything else is an external dep. */
  readonly scopePrefix: string;
  /** Pathspec for the container files to read, passed to the VCS port. */
  readonly containerFiles: string;
  /**
   * Matches ONE build invocation and captures the package name. Supplied as a source
   * string: how a build is spelled is a fact about the host's tooling, not about ordering.
   */
  readonly buildInvocation: string;
}

/** `@scope/x` → the workspace packages it depends on, also as `@scope/x`. */
export function workspaceDeps(
  read: (path: string) => string | undefined,
  list: (path: string) => readonly string[],
  packagesDir: string,
  scopePrefix: string,
): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  for (const entry of list(packagesDir)) {
    const manifestSource = read(`${packagesDir}/${entry}/package.json`);
    if (manifestSource === undefined) continue;

    let manifest: { name?: unknown; dependencies?: unknown; devDependencies?: unknown };
    try {
      manifest = JSON.parse(manifestSource) as typeof manifest;
    } catch {
      continue; // an unparseable manifest is another check's finding, not this one's
    }
    if (typeof manifest.name !== 'string') continue;

    const deps = { ...(manifest.dependencies as object), ...(manifest.devDependencies as object) };
    graph.set(
      manifest.name,
      Object.keys(deps).filter((name) => name.startsWith(scopePrefix)),
    );
  }

  return graph;
}

/** Which packages a container file builds, in the order the lines appear. */
export function buildOrder(text: string, buildInvocation: string): string[] {
  const built: string[] = [];
  for (const [, name] of text.matchAll(new RegExp(buildInvocation, 'g'))) {
    if (typeof name === 'string' && !built.includes(name)) built.push(name);
  }
  return built;
}

/**
 * What is wrong with one file's build order, if anything.
 *
 * Two distinct defects, reported apart because they are FIXED apart: a missing dependency
 * needs a line added, a late one needs two lines swapped.
 *
 * A package the graph has never heard of yields nothing. A new package reaching a container
 * file before the graph knows it must not fail a build — the manifest is the source of
 * truth and will carry it as soon as the package exists.
 */
export function violationsFor(order: readonly string[], graph: ReadonlyMap<string, readonly string[]>): string[] {
  const problems: string[] = [];

  for (const [at, name] of order.entries()) {
    for (const dep of graph.get(name) ?? []) {
      const depAt = order.indexOf(dep);
      if (depAt === -1) {
        problems.push(`builds ${name} but never builds ${dep}, which ${name} imports`);
      } else if (depAt > at) {
        problems.push(`builds ${name} before ${dep}, which ${name} imports — swap the two`);
      }
    }
  }

  return problems;
}

export function buildOrderFollowsDeps(options: IBuildOrderOptions): ICheck {
  checkOptions('buildOrderFollowsDeps', options, {
    packagesDir: { kind: 'string', required: true },
    scopePrefix: { kind: 'string', required: true },
    containerFiles: { kind: 'string', required: true },
    buildInvocation: { kind: 'string', required: true },
  });

  return buildCheck(
    {
      ...options,
      rule: options.rule ?? {
        statement: 'a build builds every workspace dependency before the package that needs it',
        owner: '@specwarden/ops',
        implied: true,
      },
      tier: options.tier ?? 'fast',
      zone: 'product',
    },
    ['read'],
    (ctx): IVerdict => {
      const graph = workspaceDeps(
        (path) => ctx.files.tryRead(path),
        (path) => (ctx.files.exists(path) ? ctx.files.list(path) : []),
        options.packagesDir,
        options.scopePrefix,
      );

      // No graph means no manifests were read: the packages directory moved, or the scope
      // prefix no longer matches. Either way every ordering below would pass vacuously.
      // Counted over IN-SCOPE names: the graph keeps every manifest it read, so a scope that
      // matched no package still left it non-empty and the second case passed in silence.
      if (![...graph.keys()].some((name) => name.startsWith(options.scopePrefix))) {
        return {
          ok: false,
          findings: [
            {
              severity: 'error',
              message: `no workspace packages found under ${options.packagesDir} with prefix ${options.scopePrefix} — this check compared nothing`,
              ruleId: options.id,
            },
          ],
        };
      }

      const findings: IFinding[] = [];
      for (const file of ctx.vcs.trackedFiles(options.containerFiles)) {
        const source = ctx.files.tryRead(file);
        if (source === undefined) continue;
        const order = buildOrder(source, options.buildInvocation);
        if (order.length === 0) continue;
        for (const problem of violationsFor(order, graph)) {
          findings.push({ severity: 'error', file, message: `${file}: ${problem}`, ruleId: options.id });
        }
      }

      return findings.length > 0
        ? { ok: false, findings }
        : {
            ok: true,
            findings: [{ severity: 'info', message: `✓ every ${options.scopePrefix}* build follows its dependencies` }],
          };
    },
  );
}
