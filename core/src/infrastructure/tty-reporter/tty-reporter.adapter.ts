import type { ICheckMeta, ICheckResult, IReporter } from '../../domain';
import { type TWriteSink, stdoutSink } from '../reporter-sink/reporter-sink.model';

export interface ITtyReporterOptions {
  /**
   * Print a line per skipped check, not just the count.
   *
   * OFF by default and deliberately: a filtered tier skips most of its roster, so
   * forty-nine `⏭` lines would bury the handful that ran. The summary names them
   * compactly instead, and this is for the moment somebody is asking "why did MY gate
   * not run" about a roster rather than about one id.
   */
  readonly showSkipped?: boolean;
  /**
   * How many of the slowest checks to name at the end. 0 turns it off.
   *
   * A tier's time is knowable — every result carries its duration — and was printed
   * nowhere, so tuning one meant timing gates by hand. Three lines is enough to find
   * the gate worth sharding and short enough that nobody scrolls past it.
   */
  readonly slowest?: number;
}

/**
 * The human-facing reporter. It renders a check's findings verbatim, one per line,
 * so a check wrapping an existing script can reproduce that script's exact text by emitting it as a
 * finding — the frame (`▶`/`✅`/`❌`) is the runner's, the lines between are the
 * check's. It decides nothing about pass/fail; it only renders the verdict.
 *
 * It never prints the value of an environment variable — it has no access to
 * `process.env` and renders only what a verdict carries. The reporter test pins
 * that: a secret in the environment must not appear in the output.
 */
export class TtyReporter implements IReporter {
  private readonly options: ITtyReporterOptions;

  constructor(
    private readonly write: TWriteSink = stdoutSink,
    options: ITtyReporterOptions = {},
  ) {
    this.options = options;
  }

  checkStarted(meta: ICheckMeta): void {
    this.write(`▶ ${meta.id} — ${meta.title}\n`);
  }

  checkFinished(result: ICheckResult): void {
    if (result.skipped) {
      if (this.options.showSkipped) this.write(`⏭  ${result.meta.id} — skipped (${result.skipped})\n`);
      return;
    }
    for (const finding of result.verdict.findings) {
      this.write(`${finding.message}\n`);
    }
    const secs = `${(result.durationMs / 1000).toFixed(1)}s`;
    if (result.verdict.ok) {
      this.write(`✅ ${result.meta.id} — ${secs}\n`);
    } else if (result.meta.advisory) {
      this.write(`⚠️  ${result.meta.id} WARNS after ${secs}\n`);
    } else {
      this.write(`❌ ${result.meta.id} FAILED after ${secs}\n`);
      if (result.meta.hint) this.write(`   💡 ${result.meta.hint}\n`);
    }
  }

  runFinished(results: readonly ICheckResult[], totalMs: number): void {
    const active = results.filter((r) => !r.skipped);
    const passed = active.filter((r) => r.verdict.ok && !r.meta.advisory).length;
    const failed = active.filter((r) => !r.verdict.ok && !r.meta.advisory).length;
    const warned = active.filter((r) => !r.verdict.ok && r.meta.advisory).length;
    const skippedResults = results.filter((r) => r.skipped);
    const secs = `${(totalMs / 1000).toFixed(1)}s`;
    const aside = [
      warned ? `${warned} warned` : '',
      skippedResults.length ? `${skippedResults.length} skipped` : '',
    ].filter(Boolean);
    const suffix = aside.length ? ` (${aside.join(', ')})` : '';

    this.writeSlowest(active);
    this.writeSkipped(skippedResults);

    // The summary line must match the run's verdict, not just count the wins: a green
    // ✅ over a run that failed a gate reads as success at exactly the moment it must
    // not. When anything failed, the line is a red ❌ that names both counts.
    if (failed > 0) {
      this.write(`\n❌ ${failed} gate(s) FAILED, ${passed} passed${suffix} in ${secs}\n`);
    } else {
      this.write(`\n✅ ${passed} gate(s) passed${suffix} in ${secs}\n`);
    }
  }

  /** Where the tier's time actually went. Silent for a run too small to have a
   * profile — naming the slowest of two checks is noise, not information. */
  private writeSlowest(active: readonly ICheckResult[]): void {
    const top = this.options.slowest ?? 0;
    if (top <= 0 || active.length < 3) return;
    const ranked = [...active].sort((a, b) => b.durationMs - a.durationMs).slice(0, top);
    if (ranked[0] === undefined || ranked[0].durationMs === 0) return;
    this.write(`\nslowest: ${ranked.map((r) => `${r.meta.id} ${(r.durationMs / 1000).toFixed(1)}s`).join(', ')}\n`);
  }

  /** The skipped ids, compactly. The count alone answers "how many" and leaves the
   * only question anybody actually asks — WHICH — unanswerable. */
  private writeSkipped(skipped: readonly ICheckResult[]): void {
    if (skipped.length === 0 || this.options.showSkipped) return;
    const shown = skipped.slice(0, 12).map((r) => r.meta.id);
    const rest = skipped.length - shown.length;
    this.write(`\nskipped: ${shown.join(', ')}${rest > 0 ? `, +${rest} more` : ''}\n`);
  }
}
