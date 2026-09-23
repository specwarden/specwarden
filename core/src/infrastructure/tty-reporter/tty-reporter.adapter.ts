import type { ICheckMeta, ICheckResult, IFinding, IReporter } from '../../domain';
import { type TWriteSink, stdoutSink } from '../reporter-sink/reporter-sink.model';
import { tallyRun } from '../run-tally/run-tally.util';

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
 * A finding as a terminal line: `file:line` first, where the finding carries them.
 *
 * The location was on every finding and printed by the annotation reporter only, so the
 * terminal said "forbidden pattern in src/util.ts: TODO" and left the reader to find the
 * line. Leading with `path:line` is what makes it clickable in every terminal and editor.
 * A message that already opens with its file gains the line there instead of the file
 * twice; a finding about no file is its message, unchanged.
 */
export function located(finding: IFinding): string {
  const { file, line, message } = finding;
  if (file === undefined || file === '') return message;
  const at = line === undefined ? file : `${file}:${line}`;
  const opensWithFile = message.startsWith(file) && !/^[\w./-]/.test(message.slice(file.length));
  if (!opensWithFile) return `${at} ${message}`;
  return message.startsWith(at) ? message : `${at}${message.slice(file.length)}`;
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
    // A check that RAN and could not look is shown whatever the flags say: it started (its
    // ▶ line is above), and what it could not see is the thing a reader must know.
    if (result.skipped === 'cannot-tell') {
      for (const finding of result.verdict.findings) this.write(`${located(finding)}\n`);
      this.write(`⏭  ${result.meta.id} — could not look here: ${result.verdict.skipped}\n`);
      return;
    }
    if (result.skipped) {
      if (this.options.showSkipped) this.write(`⏭  ${result.meta.id} — skipped (${result.skipped})\n`);
      return;
    }
    for (const finding of result.verdict.findings) {
      this.write(`${located(finding)}\n`);
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
    const tally = tallyRun(results);
    const { passed, warned } = tally;
    const failed = tally.failed.length;
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
    } else if (active.length === 0 && skippedResults.length > 0) {
      // Every selected check was skipped. "✅ 0 gate(s) passed" is a green tick over
      // nothing — the one line this product exists to never print.
      this.write(`\n⏭  nothing ran — ${skippedResults.length} skipped, 0 checked, in ${secs}\n`);
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
