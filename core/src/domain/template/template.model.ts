/**
 * A TEMPLATE — a starting tree for a kind of repository.
 *
 * WHAT CHANGED, AND WHY IT HAD TO. A template used to return `{ checks, rules }` for a
 * config to spread. That was right when a config listed its checks; it stopped being
 * right the day a check became a FILE the engine discovers. A template returning live
 * objects would have produced the one shape the convention no longer reads, and a
 * newcomer's tree would look nothing like the one the documentation describes.
 *
 * So a template emits FILES. What it supplies is the decisions — which checks are worth
 * having on day one, which options keep them from being noisy, which to leave out — and
 * it hands them over as the ordinary tree the repository then owns and edits. Nothing it
 * writes is special: no template runtime, no indirection to unpick later. The reader can
 * delete the package the day after `init` and lose nothing.
 *
 * IT MUST NOT WRITE A CHECK IT CANNOT CONFIGURE HONESTLY. A check that needs to be told
 * what a symbol looks like here, or where each kind of document belongs, is OMITTED
 * until the repository says — never written with an empty list. A registered check that
 * can never fire still shows in `doctor` as coverage, and coverage that cannot fail is
 * the exact thing this engine exists to refuse.
 */
import type { IRule } from '../rule/rule.model';

/** One file a template writes, relative to the consumer directory. */
export interface ITemplateFile {
  /** e.g. `checks/docs/doc-paths.check.mjs` — always forward-slashed. */
  readonly path: string;
  readonly body: string;
}

/** What the scaffold knows about the repository it is writing into. */
export interface ITemplateContext {
  /** git pathspec for documentation, already resolved from what was found on disk. */
  readonly docs: string;
  /** The tier the generated checks run in. */
  readonly tier: string;
  /** Workspace directories, when the repository has them. */
  readonly workspaces: readonly string[];
  /** The package manager, when it could be told. */
  readonly packageManager?: string;
  /** The test runner, when it could be told. */
  readonly testRunner?: string;
  /**
   * The scripts the root manifest declares.
   *
   * A template wrapping `npm run lint` must know whether `lint` EXISTS: written blind,
   * the generated check fails on the first run for a reason that has nothing to do with
   * the repository's code — which is the run that decides whether the tool is kept.
   */
  readonly scripts: readonly string[];
  /**
   * The CI system, when the repository has one.
   *
   * A CI-coverage check ("every heavy check has a job") needs a workflow to reconcile
   * against: written where there is none, it compares a check list to an empty set and
   * reports success — the exact failure this engine exists against.
   */
  readonly ci?: 'github' | 'gitlab';
  /** The spec framework detected, when the repository keeps its specifications in one. */
  readonly specFramework?: 'openspec' | 'speckit';
  /** Compose files found at the root. Empty means nothing here is composed. */
  readonly composeFiles: readonly string[];
  /**
   * Whether the repository has shell scripts at all.
   *
   * A shell check with an empty corpus reports that it examined nothing and fails —
   * correctly, and on a fresh scaffold that is a red first run caused by the scaffold.
   */
  readonly hasShellScripts?: boolean;
  /**
   * Workflow files, repository-relative, in the order found. An example's path comes from
   * what was found: a path the repository does not have is the first thing its reader has
   * to discover is wrong. Absent from a caller that does not detect them.
   */
  readonly workflows?: readonly string[];
  /** Reverse-proxy configs — a `Caddyfile`, an nginx `.conf` — in the order found. */
  readonly proxyConfigs?: readonly string[];
  /** Env-file samples a repository commits beside its compose file — `.env.example`. */
  readonly envSamples?: readonly string[];
}

export interface ITemplate {
  /** The name `init --template <name>` selects it by. */
  readonly name: string;
  /** One line, printed in the template list. */
  readonly describe: string;
  /**
   * Packages the generated files import. `init` refuses to write a template whose
   * packages the repository has not declared — the alternative is a tree that fails on
   * its first run with an import error, which is the run that decides whether the tool
   * is kept.
   *
   * A FUNCTION when the answer depends on the repository. A template that writes an
   * env-file check only where a compose file exists must not demand that module of
   * everyone else: a requirement nobody's tree will import is an install someone has to
   * perform to satisfy a check they do not have.
   */
  readonly requires: readonly string[] | ((context: ITemplateContext) => readonly string[]);
  /** The files to write. */
  files(context: ITemplateContext): readonly ITemplateFile[];
  /**
   * The rules the generated checks enforce, so a fresh tree has no orphan. `owner` is
   * resolved by the caller when a template leaves it empty.
   */
  rules(context: ITemplateContext): readonly IRule[];
  /**
   * Extra config fields, as SOURCE, for a template whose tree needs the config to know
   * something about it.
   *
   * The case that forced it: a template that writes a perimeter declares rules whose
   * enforcers are perimeter policy ids, not check ids. The engine resolves those through
   * `selfChecks.enforcers`, and without it `enforcement-resolves` fails on a tree
   * the template just wrote — the self-checks reporting the scaffold as a defect.
   *
   * Source rather than an object because it is spliced into a file a person then edits:
   * a serialised object would arrive with no comments and no imports.
   *
   * `imports` is separate because a field referring to something must be able to bring
   * it: the fields land inside `defineConfig({ … })` and an import cannot.
   */
  configExtras?(context: ITemplateContext): { readonly imports?: string; readonly fields: string };
}
