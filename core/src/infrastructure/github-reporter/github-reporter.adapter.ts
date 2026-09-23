import type { ICheckMeta, ICheckResult, IReporter, TSeverity } from '../../domain';
import { type TWriteSink, stdoutSink } from '../reporter-sink/reporter-sink.model';
import { tallyRun } from '../run-tally/run-tally.util';

/**
 * The run as GitHub Actions workflow commands — annotations on the diff, and a
 * collapsible group per check.
 *
 * WHY IT SHIPS HERE rather than being left to each consumer. The config's `reporter`
 * hook exists precisely so a vendor-specific renderer need not live in this package,
 * and that reasoning holds for SARIF or a bespoke dashboard. It does not hold for
 * this one: every repository whose CI is Actions wants the same forty lines, none of
 * them carries an opinion about the repository, and a consumer writing them again is
 * a consumer writing the escaping rules again — which is the part that is easy to get
 * subtly wrong and impossible to notice, because a malformed workflow command is not
 * an error, it is a line of plain text nobody sees as an annotation.
 *
 * WHAT IT DOES NOT DO: decide anything. The exit code is still the runner's, and a
 * check's verdict is rendered, never re-judged.
 */

/** Actions' own severities. A finding's `info` is not an annotation — it would put a
 * note on the diff for every line a passing check chose to explain. */
const ANNOTATION: Partial<Record<TSeverity, string>> = { error: 'error', warning: 'warning' };

/**
 * Escape a value for a workflow command's parameter list.
 *
 * The rules are Actions' own and are not the usual ones: `%`, carriage return and
 * newline are percent-encoded, and inside a parameter list a comma and a colon are too
 * — an unescaped colon in a FILE PATH silently truncates the annotation's target.
 */
function escapeProperty(value: string): string {
  return value
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A')
    .replace(/:/g, '%3A')
    .replace(/,/g, '%2C');
}

/** Escape a workflow command's message body. Same rules minus the list separators,
 * which carry no meaning after the `::`. */
function escapeData(value: string): string {
  return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

export class GithubReporter implements IReporter {
  constructor(private readonly write: TWriteSink = stdoutSink) {}

  checkStarted(meta: ICheckMeta): void {
    this.write(`::group::${escapeData(`${meta.id} — ${meta.title}`)}\n`);
  }

  checkFinished(result: ICheckResult): void {
    // A skipped check opened no group, so it closes none. Reported as a plain line so
    // the log still says the gate existed and did not run.
    // A check that ran and could not look DID open a group: its notes go inside it, as
    // plain lines — nothing it says is a defect at a location.
    if (result.skipped === 'cannot-tell') {
      for (const finding of result.verdict.findings) this.write(`${escapeData(finding.message)}\n`);
      this.write(`${escapeData(`skipped: ${result.meta.id} (cannot-tell) — ${result.verdict.skipped ?? ''}`)}\n`);
      this.write('::endgroup::\n');
      return;
    }
    if (result.skipped) {
      this.write(`skipped: ${result.meta.id} (${result.skipped})\n`);
      return;
    }

    for (const finding of result.verdict.findings) {
      // An advisory check does not block, so its errors are not errors on the diff: an
      // `::error` on a green job reads as a gate that failed.
      const level = result.meta.advisory && finding.severity === 'error' ? 'warning' : ANNOTATION[finding.severity];
      if (level === undefined) {
        this.write(`${escapeData(finding.message)}\n`);
        continue;
      }
      const properties = [
        `title=${escapeProperty(`${result.meta.id}${finding.ruleId && finding.ruleId !== result.meta.id ? ` (${finding.ruleId})` : ''}`)}`,
        finding.file === undefined ? '' : `file=${escapeProperty(finding.file)}`,
        finding.line === undefined ? '' : `line=${finding.line}`,
        finding.column === undefined ? '' : `col=${finding.column}`,
      ].filter(Boolean);
      this.write(`::${level} ${properties.join(',')}::${escapeData(finding.message)}\n`);
    }

    // The hint belongs on the log rather than on the diff: it is advice about the
    // check, not a defect at a location.
    if (!result.verdict.ok && result.meta.hint) this.write(`${escapeData(`hint: ${result.meta.hint}`)}\n`);
    this.write('::endgroup::\n');
  }

  runFinished(results: readonly ICheckResult[], totalMs: number): void {
    const { passed, failed, warned, skipped } = tallyRun(results);
    const secs = (totalMs / 1000).toFixed(1);
    const aside = warned ? ` (${warned} warned)` : '';

    if (failed.length > 0) {
      // A NOTICE rather than an error: the failures are already annotated one by one,
      // and a second error for the summary would double every count a reader sees.
      this.write(
        `::notice title=specwarden::${escapeData(`${failed.length} gate(s) failed: ${failed.map((r) => r.meta.id).join(', ')}`)}\n`,
      );
    } else if (passed + warned === 0 && skipped > 0) {
      this.write(
        `::notice title=specwarden::${escapeData(`nothing ran — ${skipped} skipped, 0 checked, in ${secs}s`)}\n`,
      );
    } else {
      this.write(`::notice title=specwarden::${escapeData(`${passed} gate(s) passed${aside} in ${secs}s`)}\n`);
    }
  }
}
