import {
  type ICheck,
  type ICorpusFloor,
  type IFinding,
  type IModuleCheckDeclaration,
  type IVerdict,
  belowCorpusFloor,
  buildCheck,
  checkOptions,
  lineOf,
  thresholdOf,
  verdictFrom,
  withExaminedNote,
} from 'specwarden';
import { MODULE_OPTIONS, failure, opsIdentity } from '../_shared/identity/identity.util';

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
 * reads the execution order, whichever form the consumer writes.
 *
 * THE CORPUS IS THE CONTAINER FILES THAT BUILD SOMETHING. A pathspec that matched no file,
 * or files in which `buildInvocation` matched nothing, left every ordering below passing
 * vacuously — and it passed, in silence, where a packages directory that moved at least
 * failed.
 *
 * WHAT IS CONFIGURATION: which directory holds the packages, what a workspace package's
 * name looks like, how a build invocation appears in the container file, and which files
 * are container files. None of that is a fact about the rule.
 */

export interface IBuildOrderOptions extends IModuleCheckDeclaration {
  /** Where the workspace packages live, repo-relative. */
  readonly packagesDir: string;
  /** A workspace package's name prefix — `@scope/`. Anything else is an external dep. */
  readonly scopePrefix: string;
  /** Pathspec for the container files to read, over tracked files. */
  readonly containerFiles: string;
  /** Matches ONE build invocation and captures the package name. How a build is spelled is
   * a fact about the consumer's tooling, not about ordering. */
  readonly buildInvocation: RegExp;
  /** How many container files that build a package a run must read. Default: at least 1. */
  readonly corpus?: ICorpusFloor;
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

/** Every build a container file runs, in order, each with the line it is on. */
function buildsIn(text: string, buildInvocation: RegExp): { name: string; line: number }[] {
  const flags = buildInvocation.flags.includes('g') ? buildInvocation.flags : `${buildInvocation.flags}g`;
  const built: { name: string; line: number }[] = [];
  for (const match of text.matchAll(new RegExp(buildInvocation.source, flags))) {
    const name = match[1];
    if (typeof name === 'string' && !built.some((b) => b.name === name)) {
      built.push({ name, line: lineOf(text, match.index) });
    }
  }
  return built;
}

/** Which packages a container file builds, in the order the lines appear. */
export function buildSequence(text: string, buildInvocation: RegExp): string[] {
  return buildsIn(text, buildInvocation).map((b) => b.name);
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
  return orderProblems(order, graph).map((p) => p.message);
}

function orderProblems(
  order: readonly string[],
  graph: ReadonlyMap<string, readonly string[]>,
): { at: number; message: string }[] {
  const problems: { at: number; message: string }[] = [];

  for (const [at, name] of order.entries()) {
    for (const dep of graph.get(name) ?? []) {
      const depAt = order.indexOf(dep);
      if (depAt === -1) {
        problems.push({
          at,
          message: `builds ${name} but never builds ${dep}, which ${name} imports — build ${dep} first.`,
        });
      } else if (depAt > at) {
        problems.push({ at, message: `builds ${name} before ${dep}, which ${name} imports — swap the two.` });
      }
    }
  }

  return problems;
}

export function buildOrder(options: IBuildOrderOptions): ICheck {
  checkOptions('buildOrder', options, {
    ...MODULE_OPTIONS,
    packagesDir: { kind: 'string', required: true, nonEmpty: true },
    scopePrefix: { kind: 'string', required: true, nonEmpty: true },
    containerFiles: { kind: 'string', required: true, nonEmpty: true },
    buildInvocation: { kind: 'regexp', required: true },
  });

  return buildCheck(
    opsIdentity(options, 'build-order', 'a build builds every workspace dependency before the package that needs it'),
    ['read'],
    (ctx, self): IVerdict => {
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
        return verdictFrom(
          [
            failure(
              `no workspace package under ${options.packagesDir} is named ${options.scopePrefix}… — point ` +
                '`packagesDir` at where the manifests are, and `scopePrefix` at the scope their names carry.',
              options.packagesDir,
            ),
          ],
          thresholdOf(ctx, self),
        );
      }

      const findings: IFinding[] = [];
      let examined = 0;
      for (const file of ctx.vcs.trackedFiles(options.containerFiles)) {
        const source = ctx.files.tryRead(file);
        if (source === undefined) continue;
        const builds = buildsIn(source, options.buildInvocation);
        if (builds.length === 0) continue;
        examined += 1;
        for (const problem of orderProblems(
          builds.map((b) => b.name),
          graph,
        )) {
          findings.push(failure(`${file}: ${problem.message}`, file, builds[problem.at]?.line));
        }
      }

      const floor = belowCorpusFloor(
        self.id,
        examined,
        options.corpus,
        `no file \`${options.containerFiles}\` matches runs a build \`buildInvocation\` matches`,
        'container file',
      );
      if (floor) return floor;

      return verdictFrom(withExaminedNote(findings, self.id, examined, 'container file'), thresholdOf(ctx, self));
    },
  );
}
