import type {
  ICheck,
  ICheckContext,
  ICheckResult,
  IFixable,
  IReporter,
  IVerdict,
  TCapability,
  TTier,
} from '../../../domain';
import { isFixable } from '../../../domain';
import type { TSharedBuildInput } from '../../config/config.model';
import { type IEngineAdapters, buildContext } from '../../container';
import { CheckRoster } from '../../container/check-roster/check-roster.service';
import { didYouMean } from '../../_shared/did-you-mean/did-you-mean.util';
import { attributionOf } from '../../../primitives/_shared';

/** What the caller asked for on the command line. */
export interface ICheckRunnerOptions {
  readonly tier?: TTier;
  /** Run exactly the named checks by id — one for the CI-job case, several for a
   * targeted local run (`--id a --id b`). Order follows the ids as given. */
  readonly ids?: readonly string[];
  /** Diff base for relevance (`base...HEAD`). Falls back to the env base. */
  readonly base?: string;
  /** `i/N`, forwarded to a check that shards. */
  readonly shard?: string;
  /** Ignore relevance — run every candidate. The explicit full run. */
  readonly all?: boolean;
  /** Apply the relevance filter even to explicitly named `ids`. Off by default: a
   * named id runs regardless of relevance (the caller chose it). CI turns it on for
   * the per-check jobs so an irrelevant check skips its expensive setup. */
  readonly ifRelevant?: boolean;
  /** Path prefixes that, when any is in the changed set, make EVERY check relevant —
   * a lockfile, a root tsconfig, a shared package. A relevance filter that let a
   * shared-input change through would be the hole it exists to prevent. Supplied by
   * the consumer (which files are "shared" is a fact about the repo), optionally with
   * the reason each one is shared — which is what the full-run reason then reports. */
  readonly sharedBuildInputs?: readonly TSharedBuildInput[];
  /**
   * Diff sizes above which relevance is dropped and every candidate runs — the
   * SECOND sieve behind `sharedBuildInputs`, and openly the weaker one. Size
   * correlates poorly with risk (a one-line migration outranks a thousand-line copy
   * edit), so it exists only to catch the wide change that names none of the shared
   * inputs. The numbers are the consumer's: what counts as "unusually wide" is a
   * fact about a repository's own cadence, and a threshold that fires on every push
   * turns the full run back into the tier it replaced.
   */
  readonly fullRunTriggers?: { readonly files?: number; readonly lines?: number };
  /** Capabilities the repository refuses to grant; a check declaring one is not run. */
  readonly denyCapabilities?: readonly TCapability[];
  /** Apply autofix: a failing check that is fixable repairs its findings, then is
   * re-run so the reported verdict reflects what remains. */
  readonly fix?: boolean;
  /** Lower each ratcheted check's threshold to its observed count when lower. Never
   * set in pre-push — a check that under-counted once would pin an unreachable
   * target and fail forever. Only an explicit command. */
  readonly tighten?: boolean;
  /**
   * How many checks may be in flight at once. Default 1 — the historical behaviour,
   * and still the right default for a small tier where the overhead would dominate.
   *
   * It is worth setting when checks SPEND their time outside this process. Most of a
   * real tier's wall clock is external commands — a test suite, a compiler, a shell
   * script — and those overlap perfectly while the engine's own checks measure in
   * fractions of a second. On this repository's fast tier three quarters of the time
   * is external.
   *
   * IGNORED under `fix` or `tighten`. Both WRITE — one to the tree, the other to the
   * ratchet store — and a concurrent writer is a corruption nobody would trace back
   * to a flag. Speed is not worth a ratchet that silently records the wrong number.
   */
  readonly jobs?: number;
}

/** The ambient environment, read as data rather than off `process.env` directly,
 * so the runner is testable. Names are the ported ones: SPECWARDEN_SKIP/ALL/BASE. */
export interface ICheckRunnerEnv {
  readonly ci: boolean;
  readonly skip?: string;
  readonly all?: boolean;
  readonly base?: string;
}

/** Thrown for a usage error (an unknown id in a skip list) — the CLI turns it into
 * exit code 2. */
export class RunnerUsageError extends Error {
  override readonly name = 'RunnerUsageError';
}

/**
 * What a run MEASURED, for the ratchet store.
 *
 * The verdict's own statement wins; counting error findings is the fallback. That
 * order is the fix for a real defect: a check that summarises its violations into a
 * single line reports the real number on the verdict, and counting findings instead
 * gives zero on every passing run — so `--tighten` would rewrite a tolerated count
 * down to 0 and fail the very next ordinary run — a command whose whole purpose is to record
 * the truth, recording a fiction.
 */
function measurementOf(verdict: IVerdict): number {
  return verdict.measured ?? verdict.findings.filter((f) => f.severity === 'error').length;
}

/**
 * Attribute every finding to the rule it proves — the check's rule, else the check.
 *
 * A finding's `ruleId` is what links evidence back to the assertion it disproves.
 * `buildCheck` stamps it on every factory's findings; this covers a check built any other
 * way, and a finding the runner itself writes (a throw, a denied capability), so the same
 * run never produces findings that can be traced beside findings that cannot.
 */
function attributed(verdict: IVerdict, check: ICheck): IVerdict {
  const ruleId = attributionOf(check);
  if (verdict.findings.every((f) => f.ruleId === ruleId)) return verdict;
  return { ...verdict, findings: verdict.findings.map((f) => ({ ...f, ruleId })) };
}

/** A verdict that holds and says it could not look. One that found a defect did look. */
const couldNotLook = (verdict: IVerdict): boolean =>
  verdict.ok && typeof verdict.skipped === 'string' && verdict.skipped.trim() !== '';

/** A check's result — skipped as `cannot-tell` when its verdict says it could not look, so
 * no reporter counts it as a pass. */
function resultOf(check: ICheck, verdict: IVerdict, durationMs: number): ICheckResult {
  return couldNotLook(verdict)
    ? { meta: check, verdict, durationMs, skipped: 'cannot-tell' }
    : { meta: check, verdict, durationMs };
}

/** How a run ended: the exit code plus the results, so a caller (and a test) can
 * inspect what happened without parsing printed output. */
export interface IRunResult {
  readonly exitCode: number;
  readonly results: readonly ICheckResult[];
  /**
   * Why relevance was dropped and every candidate ran, when it was — a shared build
   * input, a diff too wide, an unreadable range, or `--all`. It is returned rather
   * than merely acted on because an unexplained full run and an unexplained filtered
   * run print the same thing, and then nobody can tell a trigger that always fires
   * from a tier that was never filtered.
   */
  readonly fullRunReason?: string;
}

/**
 * When an unknown id is a check FILE's name, the id that file declares. A file's id may
 * differ from its name, and `--id <file name>` then found nothing, with no clue why.
 */
function declaredInstead(roster: CheckRoster, id: string): string {
  const stem = (origin: string): string => origin.slice(origin.lastIndexOf('/') + 1).replace(/\.check\.mjs$/, '');
  const named = roster.all().filter((check) => {
    const origin = roster.originOf(check);
    return origin !== undefined && stem(origin) === id;
  });
  if (named.length === 0)
    return didYouMean(
      id,
      roster.all().map((check) => check.id),
    );
  return ` — ${roster.originOf(named[0])} declares ${named.map((check) => `'${check.id}'`).join(', ')}`;
}

/**
 * The checks a line selects — the one derivation `check` and `check --list` share.
 *
 * `--tier` and `--id` TOGETHER select the named checks of that tier, and an id outside
 * it is refused: `--tier heavy --id no-todo` ran the fast `no-todo`, so a CI job
 * named for one tier ran a check from another and nobody could tell from the line.
 *
 * A tier holding NO check is refused for a run (`forRun`): it passed, "0 check(s) passed", a job green over nothing — the founding failure, reached by a typo in a
 * workflow or a tier whose last check moved. `--list` answers the question instead.
 */
export function selectChecks(
  roster: CheckRoster,
  options: Pick<ICheckRunnerOptions, 'ids' | 'tier'>,
  forRun = false,
): readonly ICheck[] {
  if (options.ids?.length) {
    return options.ids.map((id) => {
      const check = roster.byId(id);
      if (!check) throw new RunnerUsageError(`unknown check id '${id}'${declaredInstead(roster, id)}`);
      if (options.tier !== undefined && check.tier !== options.tier) {
        throw new RunnerUsageError(
          `'${id}' is in tier ${check.tier}, not ${options.tier} — with --tier, --id names checks of that tier`,
        );
      }
      return check;
    });
  }
  if (options.tier === undefined) return roster.all();
  const inTier = roster.forTier(options.tier);
  if (forRun && inTier.length === 0) {
    throw new RunnerUsageError(`tier '${options.tier}' holds no check — a run over it would pass having run nothing`);
  }
  return inTier;
}

/**
 * The runner — it decides WHICH checks run and executes them, and owns no check
 * logic. Sequential on purpose: a stable order makes the tier manifest reproducible,
 * and a shuffled interleaving of two checks could not be compared to a snapshot.
 *
 * Relevance is filtered by the changed set (an unknowable set runs everything, never
 * nothing); an explicit full run drops the filter; SPECWARDEN_SKIP is honoured locally
 * and IGNORED under CI, because a skip that reaches CI is a hole, not a skip.
 *
 * Every route to "run everything" goes through `reasonToRunEverything`, and it returns
 * a STRING rather than a boolean on purpose: a full run that cannot say why it is one
 * is indistinguishable from a tier nobody ever filtered.
 */
export class CheckRunner {
  constructor(
    private readonly roster: CheckRoster,
    private readonly adapters: IEngineAdapters,
    private readonly reporter: IReporter,
  ) {}

  async run(options: ICheckRunnerOptions, env: ICheckRunnerEnv): Promise<IRunResult> {
    const base = options.base ?? env.base;
    const full = Boolean(options.all) || Boolean(env.all);
    // `undefined` changed set means "cannot tell" → run everything, never nothing.
    const changed = full ? undefined : this.adapters.vcs.changedFiles(base);

    const candidates = selectChecks(this.roster, options, true);
    const skip = this.resolveSkip(env, candidates);
    const denied = new Set<TCapability>(options.denyCapabilities ?? []);
    // One derivation of "relevance does not apply here", shared with relevanceOf: a
    // shared build input, a diff too wide, an unreadable range, or an explicit --all.
    // `changed` itself is left alone — a check still receives the real changed set,
    // because forcing relevance is not the same as claiming nothing is known.
    const fullRunReason = this.reasonToRunEverything(options, env, changed, base);
    const named = Boolean(options.ids?.length);
    const isRelevant = (check: ICheck): boolean => fullRunReason !== undefined || check.when(changed ?? []);

    const results: ICheckResult[] = [];
    const runStart = this.adapters.clock.monotonicMs();

    // A run that writes runs alone; see `jobs` on the options.
    const lanes = options.fix || options.tighten ? 1 : Math.max(1, Math.trunc(options.jobs ?? 1));

    if (lanes > 1) {
      const outcome = await this.runConcurrently(candidates, lanes, {
        named,
        isRelevant,
        skip,
        denied,
        options,
        changed,
      });
      results.push(...outcome);
      this.reporter.runFinished(results, this.adapters.clock.monotonicMs() - runStart, { fullRunReason });
      const anyFailed = results.some((r) => !r.skipped && !r.verdict.ok && !r.meta.advisory);
      return { exitCode: anyFailed ? 1 : 0, results, fullRunReason };
    }

    for (const check of candidates) {
      // A named check runs regardless of relevance — the caller chose it — UNLESS
      // ifRelevant is set (CI, to skip an irrelevant check's setup). An unnamed run
      // always applies the filter.
      if ((!named || options.ifRelevant) && !isRelevant(check)) {
        results.push(this.report(this.skipped(check, 'not-relevant')));
        continue;
      }
      if (skip.has(check.id)) {
        results.push(this.report(this.skipped(check, 'by-request')));
        continue;
      }
      const forbidden = check.capabilities.filter((c) => denied.has(c));
      if (forbidden.length > 0) {
        this.reporter.checkStarted(check);
        const result: ICheckResult = {
          meta: check,
          durationMs: 0,
          verdict: {
            ok: false,
            findings: [
              {
                severity: 'error',
                message: `${check.id} declares capability ${forbidden.join(', ')}, which this repository denies (denyCapabilities). It was not run.`,
                ruleId: attributionOf(check),
              },
            ],
          },
        };
        results.push(result);
        this.reporter.checkFinished(result);
        continue;
      }

      this.reporter.checkStarted(check);
      const stored = check.ratchet ? this.adapters.ratchets.read(check.ratchet.id)?.value : undefined;
      const ctx = buildContext(check, this.adapters, changed ?? [], options.shard, stored, () => this.roster.all());
      const started = this.adapters.clock.monotonicMs();
      let verdict = await this.execute(check, ctx);
      if (options.fix && !verdict.ok && isFixable(check)) {
        verdict = await this.applyFix(check, ctx, verdict);
      } else if (options.fix && !verdict.ok) {
        // `--fix` over a check that has none was silent, so a red run after it read as a
        // repair that failed rather than one never attempted.
        verdict = {
          ...verdict,
          findings: [
            ...verdict.findings,
            {
              severity: 'info',
              message: `${check.id} has no fix — --fix repairs only what a check can derive, and this one declares no repair.`,
              ruleId: attributionOf(check),
            },
          ],
        };
      }
      if (options.tighten) this.tighten(check, verdict);
      const durationMs = this.adapters.clock.monotonicMs() - started;
      const result = resultOf(check, verdict, durationMs);
      results.push(result);
      this.reporter.checkFinished(result);
    }

    this.reporter.runFinished(results, this.adapters.clock.monotonicMs() - runStart, { fullRunReason });

    const failed = results.some((r) => !r.skipped && !r.verdict.ok && !r.meta.advisory);
    return { exitCode: failed ? 1 : 0, results, fullRunReason };
  }

  /**
   * Why the relevance filter must not apply, or `undefined` when it does.
   *
   * The order is the order of confidence. A shared build input is a stated fact about
   * the repository's layout; an unreadable range is fail-safe; SIZE is last and is
   * openly the weakest — it exists only for the wide change that names none of the
   * shared inputs, and it is consulted only when a threshold was configured, so a
   * consumer that declares none pays no git call for it.
   *
   * It returns the first reason rather than all of them: a full run is a full run, and
   * the value of the string is to name the ONE thing a reader should look at.
   */
  private reasonToRunEverything(
    options: ICheckRunnerOptions,
    env: ICheckRunnerEnv,
    changed: readonly string[] | undefined,
    base: string | undefined,
  ): string | undefined {
    if (options.all === true || env.all === true) return 'requested explicitly (--all / SPECWARDEN_ALL)';
    if (changed === undefined) return 'the changed-file range could not be read — running everything is the fail-safe';
    // With no base, the range is the commits not yet on a remote — the pre-push range.
    // A CI checkout builds a commit that is ALREADY pushed, so that range is empty by
    // construction, and "nothing new to push" was read as "nothing changed": a CI job at a
    // pushed commit ran only the always-on checks and exited 0. The version-control answer
    // is honest; it is this question it cannot answer. Under CI it is "cannot tell".
    // `GITHUB_BASE_REF` is not read as a default base: it is one forge's variable, and a
    // full run is correct on every forge — the narrower run is one `--base` away.
    if (env.ci && base === undefined && changed.length === 0) {
      return 'under CI with no --base, the unpushed range is empty and cannot tell what changed — pass --base <ref> for a filtered run';
    }

    for (const input of options.sharedBuildInputs ?? []) {
      const prefix = typeof input === 'string' ? input : input.prefix;
      const why = typeof input === 'string' ? undefined : input.why;
      const hit = changed.find((f) => f.startsWith(prefix));
      if (hit === undefined) continue;
      // The consumer's own reason when it has one. The generic fallback is deliberately
      // weak, which is the argument for supplying one: "may have moved" is the right
      // sentence for a lockfile and the wrong one for a schema migration.
      return why !== undefined
        ? `${hit} — ${why}`
        : `${hit} is a shared build input (${prefix}) — what it resolves to may have moved`;
    }

    const triggers = options.fullRunTriggers;
    if (triggers === undefined) return undefined;
    if (typeof triggers.files === 'number' && changed.length >= triggers.files) {
      return `${changed.length} files changed (trigger: ${triggers.files}) — size is a weak signal, but a change this wide outruns any predicate`;
    }
    if (typeof triggers.lines === 'number') {
      const lines = this.adapters.vcs.changedLineCount(base);
      // `undefined` here is "cannot tell" for the SIZE only — the file list was
      // readable, so it is not grounds for a full run on its own.
      if (typeof lines === 'number' && lines >= triggers.lines) {
        return `${lines} lines changed (trigger: ${triggers.lines}) — size is a weak signal, but a change this wide outruns any predicate`;
      }
    }
    return undefined;
  }

  /**
   * Record what a ratcheted check measured, under `--tighten` — only from a PASSING
   * verdict, and never past the ceiling the check declares.
   *
   * Both limits close the same hole from two sides. A failing verdict's count is the
   * regression itself: recorded, a red run at 3 over a bar of 0 became the new threshold
   * and the next run was green. And a stored value above the declared ceiling is exactly
   * what the at-rest audit refuses — so the command whose only job is to lower a bar was
   * the thing that raised it, and then the audit told the reader to run that command.
   */
  private tighten(check: ICheck, verdict: IVerdict): void {
    // A run that could not look measured nothing, and zero is not what it saw.
    if (check.ratchet === undefined || !verdict.ok || couldNotLook(verdict)) return;
    const { id, direction = 'down', ceiling } = check.ratchet;
    const measured = measurementOf(verdict);
    const bounded =
      ceiling === undefined ? measured : direction === 'up' ? Math.max(measured, ceiling) : Math.min(measured, ceiling);
    this.adapters.ratchets.tighten(id, bounded, direction);
  }

  /** Answer "would this check run against the current change?" — `'run'` or `'skip'`
   * — WITHOUT running it, so a CI job can skip an expensive setup (a database, a
   * migration) for a check the diff cannot affect. Same relevance rule the run loop
   * uses: unknown diff or a shared-input change means run. */
  relevanceOf(id: string, options: ICheckRunnerOptions, env: ICheckRunnerEnv): 'run' | 'skip' {
    const check = this.roster.byId(id);
    if (!check) throw new RunnerUsageError(`unknown check id '${id}'${declaredInstead(this.roster, id)}`);
    const full = Boolean(options.all) || Boolean(env.all);
    const base = options.base ?? env.base;
    const changed = full ? undefined : this.adapters.vcs.changedFiles(base);
    // The SAME derivation the run loop uses. Two copies of it would let a CI job skip
    // an expensive setup for a check the run would then have insisted on running.
    if (this.reasonToRunEverything(options, env, changed, base) !== undefined) return 'run';
    return check.when(changed ?? []) ? 'run' : 'skip';
  }

  /** A check's own error is a failure, not a crash of the run — it becomes a
   * finding so the reporter can show it and the run continues to the next check. */
  private async execute(check: ICheck, ctx: Parameters<ICheck['run']>[0]): Promise<IVerdict> {
    try {
      return attributed(await this.withDeadline(check, ctx), check);
    } catch (err) {
      return attributed(
        { ok: false, findings: [{ severity: 'error', message: err instanceof Error ? err.message : String(err) }] },
        check,
      );
    }
  }

  /**
   * Run a check under its declared deadline, or without one when it declares none.
   *
   * The timer is unref'd so a check that finishes first does not hold the process open
   * waiting for a deadline nobody needs — a run that exits and then sits there for the
   * length of the longest declared timeout is a CI job that looks hung while being
   * finished.
   *
   * A timed-out check FAILS rather than being skipped. The two are opposite claims: a
   * skip says "this could not have been affected", and a stall says "nobody knows what
   * this would have said", which is never grounds for a green run.
   */
  private async withDeadline(check: ICheck, ctx: Parameters<ICheck['run']>[0]): Promise<IVerdict> {
    if (check.timeoutSec === undefined) return check.run(ctx);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              `${check.id} exceeded its ${check.timeoutSec}s deadline and was abandoned. The work it started may still be running: ` +
                'a deadline ends the WAIT, and only a subprocess timeout ends the process.',
            ),
          ),
        (check.timeoutSec as number) * 1000,
      );
      timer.unref?.();
    });
    try {
      return await Promise.race([check.run(ctx), deadline]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /** Apply a fixable check's repair, then re-run it so the verdict reflects what
   * remains. A fix that throws (often because the check did not declare `write`, so
   * its writer refuses) becomes an error finding, never a crashed run. */
  private async applyFix(check: ICheck & IFixable, ctx: ICheckContext, before: IVerdict): Promise<IVerdict> {
    try {
      const outcome = await check.fix(ctx);
      const after = await this.execute(check, ctx);
      return {
        ok: after.ok,
        findings: [
          {
            severity: 'info',
            message: `fixed ${outcome.fixed} finding(s)${outcome.summary ? `: ${outcome.summary}` : ''}`,
            ruleId: attributionOf(check),
          },
          ...after.findings,
        ],
      };
    } catch (err) {
      return {
        ok: false,
        findings: [
          ...before.findings,
          {
            severity: 'error',
            message: `fix failed: ${err instanceof Error ? err.message : String(err)}`,
            ruleId: attributionOf(check),
          },
        ],
      };
    }
  }

  private resolveSkip(env: ICheckRunnerEnv, candidates: readonly ICheck[]): Set<string> {
    const raw = (env.skip ?? '').trim();
    if (raw === '') return new Set();
    if (env.ci) return new Set(); // a skip that reaches CI is a hole
    if (raw.toLowerCase() === 'all') return new Set(candidates.map((c) => c.id));
    const wanted = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const unknown = wanted.filter((id) => !this.roster.byId(id));
    if (unknown.length > 0) {
      const ids = this.roster.all().map((check) => check.id);
      throw new RunnerUsageError(
        `unknown check id(s) in skip: ${unknown.map((id) => `${id}${didYouMean(id, ids)}`).join(', ')}`,
      );
    }
    return new Set(wanted);
  }

  /**
   * Hand a result to the reporter and pass it on.
   *
   * A SKIPPED result used to be pushed and never reported, in both the serial and the
   * concurrent path, which made the reporter's own skip branch unreachable code: a run
   * printed '(49 skipped)' and there was no way to learn WHICH except asking about one
   * id at a time. The reporter decides whether to show them; the runner's job is to
   * stop hiding them.
   */
  private report(result: ICheckResult): ICheckResult {
    this.reporter.checkFinished(result);
    return result;
  }

  private skipped(check: ICheck, why: 'not-relevant' | 'by-request'): ICheckResult {
    return { meta: check, verdict: { ok: true, findings: [] }, durationMs: 0, skipped: why };
  }

  /**
   * Run the candidates with at most `lanes` in flight, reporting IN REGISTRY ORDER.
   *
   * The ordering is the part that takes care. Reporting on completion would be
   * simpler and would make two runs of the same tree print different orders — which
   * costs the ability to diff one run against another, the cheapest debugging tool
   * this output has. So a finished result waits until every result before it has been
   * reported, and then the whole ready prefix is flushed at once. The overlap is
   * unaffected: work still starts as early as a lane allows, only the SPEAKING is
   * ordered.
   */
  private async runConcurrently(
    candidates: readonly ICheck[],
    lanes: number,
    ctx: {
      named: boolean;
      isRelevant: (check: ICheck) => boolean;
      skip: ReadonlySet<string>;
      denied: ReadonlySet<TCapability>;
      options: ICheckRunnerOptions;
      changed: readonly string[] | undefined;
    },
  ): Promise<readonly ICheckResult[]> {
    const slots = new Array<ICheckResult | undefined>(candidates.length);
    const started = new Array<boolean>(candidates.length).fill(false);
    let flushed = 0;

    const flushReady = (): void => {
      while (flushed < slots.length && slots[flushed] !== undefined) {
        // A skipped check is reported like any other — it was never announced as
        // STARTED, which is right, but withholding its result left the reporter unable
        // to name a single skipped check. Same rule as the serial path.
        this.reporter.checkFinished(slots[flushed] as ICheckResult);
        flushed++;
      }
    };

    let next = 0;
    let live = 0;
    let exclusiveHeld = false;
    /** Yield until the predicate holds AND has claimed its slot. A lane parks here
     * rather than spinning; the predicate is what makes the claim, so testing and
     * claiming cannot be split by a scheduler tick. */
    const until = async (ready: () => boolean): Promise<void> => {
      while (!ready()) await new Promise((r) => setTimeout(r, 0));
    };

    const lane = async (): Promise<void> => {
      for (;;) {
        const index = next++;
        if (index >= candidates.length) return;
        const check = candidates[index];

        const decided = this.decide(check, ctx);
        if (decided) {
          slots[index] = decided;
          flushReady();
          continue;
        }

        // Isolation, declared by the check: an exclusive one waits for the machine to
        // empty, and everything else waits for it. See `exclusive` on ICheck for what
        // this costs and why assuming isolation instead is worse.
        //
        // The test and the claim happen in ONE synchronous step. Awaiting a predicate
        // and then claiming is a race: two lanes both observe the machine free in the
        // same tick, and both proceed — which is how an exclusive check ends up with
        // company.
        await until(() => {
          if (check.exclusive) {
            if (live > 0 || exclusiveHeld) return false;
            exclusiveHeld = true;
          } else {
            if (exclusiveHeld) return false;
          }
          live++;
          return true;
        });

        // Announced at the moment work begins, so a long check is visible while it
        // runs rather than only once the prefix ahead of it has drained.
        if (!started[index]) {
          started[index] = true;
          this.reporter.checkStarted(check);
        }
        try {
          slots[index] = await this.runOne(check, ctx.options, ctx.changed);
        } finally {
          live--;
          if (check.exclusive) exclusiveHeld = false;
        }
        flushReady();
      }
    };

    await Promise.all(Array.from({ length: Math.min(lanes, candidates.length) }, lane));
    flushReady();
    return slots.filter((r): r is ICheckResult => r !== undefined);
  }

  /** The verdicts reachable without running the check: skipped, or capability-denied. */
  private decide(
    check: ICheck,
    ctx: {
      named: boolean;
      isRelevant: (c: ICheck) => boolean;
      skip: ReadonlySet<string>;
      denied: ReadonlySet<TCapability>;
      options: ICheckRunnerOptions;
    },
  ): ICheckResult | undefined {
    if ((!ctx.named || ctx.options.ifRelevant) && !ctx.isRelevant(check)) return this.skipped(check, 'not-relevant');
    if (ctx.skip.has(check.id)) return this.skipped(check, 'by-request');
    const forbidden = check.capabilities.filter((c) => ctx.denied.has(c));
    if (forbidden.length === 0) return undefined;
    return {
      meta: check,
      durationMs: 0,
      verdict: {
        ok: false,
        findings: [
          {
            severity: 'error',
            message: `${check.id} declares capability ${forbidden.join(', ')}, which this repository denies (denyCapabilities). It was not run.`,
            ruleId: attributionOf(check),
          },
        ],
      },
    };
  }

  /** One check, start to verdict. Never called on a fix/tighten run — those are serial. */
  private async runOne(
    check: ICheck,
    options: ICheckRunnerOptions,
    changed: readonly string[] | undefined,
  ): Promise<ICheckResult> {
    const stored = check.ratchet ? this.adapters.ratchets.read(check.ratchet.id)?.value : undefined;
    const context = buildContext(check, this.adapters, changed ?? [], options.shard, stored, () => this.roster.all());
    const startedAt = this.adapters.clock.monotonicMs();
    const verdict = await this.execute(check, context);
    return resultOf(check, verdict, this.adapters.clock.monotonicMs() - startedAt);
  }
}
