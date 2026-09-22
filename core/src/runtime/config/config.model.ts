import type { ICheck, IPlugin, IReporter, IRule, ISpecSource, TCapability, TOwnershipMap } from '../../domain';
import type { IEngineAdapters } from '../container';
import type { IHarnessOptions } from '../consumer-tree/harness-checks/harness-checks.factory';

/**
 * A shared build input: a bare path prefix, or a prefix that carries the reason its
 * blast radius is wider than its own diff. Both forms are accepted so a repository can
 * start with a list and add reasoning where it has any.
 */
export type TSharedBuildInput = string | { readonly prefix: string; readonly why?: string };

/**
 * What a consumer's `.specwarden/warden.config.mjs` exports (as its default). The
 * consumer zone owns this file — it names the checks, which is where repository
 * knowledge belongs. The product only defines the shape and loads it.
 */
export interface IWardenConfig {
  /** The config-schema major this file was written against. Omitted means the
   * current version; a value newer than the engine speaks is refused. */
  readonly version?: number;
  /**
   * Checks declared inline. OPTIONAL since the tree is read by convention: a check is
   * a file under `checks/**\/*.check.mjs` and is found without being named here. This
   * list is for the check that cannot be a file — one built from another's result, or
   * one whose options only exist at config time.
   */
  readonly checks?: readonly ICheck[];
  /** Read `checks/` by convention. Default true; false for a repository that insists
   * on naming every check here, at the cost of the forgotten-import failure. */
  readonly autoload?: boolean;
  /** The folder under the consumer directory that holds check files. Default `checks`. */
  readonly checksDir?: string;
  /**
   * The harness's checks on ITSELF — rule ownership, rule coverage, orphans,
   * enforcer resolution, ratchet direction — built from convention unless tuned here.
   * `false` removes them all, which a repository should have to say out loud.
   */
  readonly harness?: IHarnessOptions | false;
  /** Plugins whose declarations (checks, doc kinds) are merged into the run. A
   * plugin declares WHAT to check; it never supplies a port adapter. */
  readonly plugins?: readonly IPlugin[];
  /** Where requirements and tasks come from when a spec-driven tool sits on top.
   * Defaults to the native plans. */
  readonly specSource?: ISpecSource;
  /** How `sync-invariants` finds the invariants already deposited in the corpus:
   * the docs to scan and the pattern whose first group is an invariant id (its
   * shape is a fact about the host's documentation convention). */
  readonly invariants?: { readonly docs: string; readonly idPattern: RegExp };
  /**
   * Path prefixes that make EVERY check relevant when any is in the changed set — a
   * lockfile, a root tsconfig, a shared package. Which files are "shared build
   * inputs" is a fact about the repo layout, so the consumer supplies them; the
   * relevance filter treats a change to one as "run everything".
   *
   * An entry may carry its own `why`, and it is worth carrying: the reason a full run
   * happened is printed, and a shared prefix without one can only be explained
   * generically ("what this resolves to may have moved") — which for a migration or an
   * SSE event is not merely vague, it is the wrong reason.
   */
  readonly sharedBuildInputs?: readonly TSharedBuildInput[];
  /**
   * Diff sizes above which relevance is dropped and every check runs, whatever the
   * paths were. The SECOND sieve behind `sharedBuildInputs`, and openly the weaker
   * one: size correlates poorly with risk, so this exists only for the wide change
   * that touches none of the shared inputs. Declaring nothing disables it — and it
   * disables cleanly, costing not even the git call that counts the lines.
   *
   * The numbers belong to the consumer because "unusually wide" is a fact about a
   * repository's own cadence: derive them from the diffs it actually merges, or the
   * full run becomes the tier it was meant to replace.
   */
  readonly fullRunTriggers?: { readonly files?: number; readonly lines?: number };
  /** Who owns each artifact of work — declared, so a conflict is a loud refusal
   * rather than two silent copies. */
  readonly ownership?: TOwnershipMap;
  /** The rules the repository declares — the headline metric is coverage over
   * these. A rule with no enforcer is allowed when it declares why; an enforcer
   * with no rule is a defect. */
  readonly rules?: readonly IRule[];
  /**
   * Whole classes of capability the repository refuses to grant any check. A check
   * that DECLARES a denied capability is not run — it fails with a legible message —
   * because installing a check is running someone else's code in your CI and
   * pre-push, and a repo may decide no check of its will ever touch the network or
   * write to the tree.
   */
  readonly denyCapabilities?: readonly TCapability[];
  /**
   * The tier names this repository uses, when the built-in three do not fit.
   *
   * `fast`/`heavy`/`nightly` are one repository's schedule that happened to ship with
   * the engine. A house running `pre-commit` / `pr` / `release` declares them here and
   * the CLI accepts exactly those, so a typo'd `--tier prr` is still refused by name
   * rather than silently selecting nothing — which is the whole reason the list is
   * validated at all.
   */
  readonly tiers?: readonly string[];
  /**
   * How many checks may run at once, when `--jobs` is not given. Default 1.
   *
   * Worth raising when a tier's time is spent OUTSIDE this process — test suites,
   * compilers, shell scripts — which is the usual case for a mature gate list. The
   * engine's own checks measure in fractions of a second and gain nothing.
   *
   * Ignored by `--fix` and `--tighten`: both write, and a concurrent writer is a
   * corruption nobody would trace back to a flag.
   */
  readonly concurrency?: number;

  /**
   * Replace any port with your own implementation.
   *
   * The engine is ports-and-adapters, but until this existed only half of that was
   * true: the interfaces were published and the implementations were welded in, so a
   * consumer could describe a different world and not run in it. What the built-ins
   * assume is ordinary and often wrong somewhere — that history is git, that a ratchet
   * is a JSON file on this disk, that "now" is the system clock.
   *
   * Receives the defaults, returns only what it wants changed; everything omitted
   * stays the built-in, so overriding one port is one line and does not oblige you to
   * construct the other five.
   *
   *   adapters: (defaults) => ({ ratchets: new RedisRatchetStore(url) })
   *
   * `root` is the repository root the engine resolved, which is what most custom
   * adapters need and cannot work out for themselves.
   */
  readonly adapters?: (defaults: IEngineAdapters, context: { readonly root: string }) => Partial<IEngineAdapters>;
  /**
   * Where a run's results go, when neither of the two built-ins is what you need.
   *
   * `--json` and the TTY renderer cover a terminal and a script; they do not cover
   * SARIF for code scanning, JUnit for a CI dashboard, or an annotation API. Those are
   * all the same `IReporter`, and none of them belong in this package — a reporter for
   * one vendor's dashboard is not product knowledge.
   *
   * `json` says which built-in would have been chosen, so a custom reporter can honour
   * `--json` or ignore it deliberately.
   */
  readonly reporter?: (context: { readonly json: boolean; readonly out: (text: string) => void }) => IReporter;
}

/** Identity helper for the config file, present for the editor types alone — the
 * same role `defineConfig` plays in the tools this borrows the pattern from. */
export function defineConfig(config: IWardenConfig): IWardenConfig {
  return config;
}
