import type { ICheckMeta, ICheckResult, IReporter, IRunSummary } from '../../domain';
import { OUTPUT_VERSION } from '../../contracts/version/version.constant';
import { type TWriteSink, stdoutSink } from '../reporter-sink/reporter-sink.model';

/**
 * The machine-facing reporter — the same run as JSON, for a CI annotation or a
 * later tool. Like its TTY sibling it renders only what verdicts carry and never
 * touches `process.env`. It accumulates results and emits one document at the end
 * so the output is a single valid JSON value, not a stream of concatenated ones.
 */
export class JsonReporter implements IReporter {
  constructor(private readonly write: TWriteSink = stdoutSink) {}

  checkStarted(_meta: ICheckMeta): void {
    // Nothing to emit at start; JSON is produced whole at the end.
  }

  checkFinished(_result: ICheckResult): void {
    // Nothing per-check: the document is built from the full result set at the end,
    // so a SKIPPED check — which never reaches checkFinished — still appears. Building
    // from accumulated checkFinished calls silently dropped every skip, and a machine
    // consumer could not tell a skipped check from one that never existed.
  }

  runFinished(results: readonly ICheckResult[], totalMs: number, run: IRunSummary = {}): void {
    const rows = results.map((r) => ({
      id: r.meta.id,
      tier: r.meta.tier,
      advisory: Boolean(r.meta.advisory),
      skipped: r.skipped ?? null,
      ok: r.verdict.ok,
      durationMs: r.durationMs,
      findings: r.verdict.findings,
    }));
    // The reason a run was not filtered travels WITH it: a dashboard reading this could
    // not tell a filtered run from a fail-safe one, which the terminal says in a line.
    const reason = run.fullRunReason === undefined ? {} : { fullRunReason: run.fullRunReason };
    this.write(`${JSON.stringify({ version: OUTPUT_VERSION, totalMs, ...reason, results: rows }, null, 2)}\n`);
  }
}
