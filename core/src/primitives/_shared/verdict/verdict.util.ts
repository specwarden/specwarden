import {
  type ICheck,
  type ICheckContext,
  type IFinding,
  type IVerdict,
  type TRatchetDirection,
  satisfiesRatchet,
} from '../../../domain';

/**
 * Frame a verdict so a check that PASSES but still carries `error`-severity findings
 * (a ratchet tolerating pre-existing violations) prepends a summary — the reporter
 * renders findings verbatim, so without the frame a green ✅ is printed above a wall
 * of `error` lines that read as failures. The error findings are kept (and kept
 * `error`): `--tighten` counts them to re-arm the ratchet, and any increase still
 * flips `ok`. A no-op when the check failed or has no error findings.
 *
 * `ratchetLabel` names the tolerance in the summary — `ratchet 3` for a single
 * inline ratchet, or a phrase for a check with several (a sizing rule plus an
 * acceptance rule, say). This is shared by `verdictFrom` and the hand-rolled
 * multi-ratchet checks so all of them frame a tolerated pass the same way.
 */
export function frameTolerated(ok: boolean, findings: readonly IFinding[], ratchetLabel = 'a ratchet'): IVerdict {
  const errors = findings.filter((f) => f.severity === 'error').length;
  if (ok && errors > 0) {
    const summary: IFinding = {
      severity: 'info',
      message: `↑ ${errors} pre-existing violation(s) tolerated under ${ratchetLabel}; the lines below are that tolerated set, not new failures. Any increase fails this check.`,
    };
    return { ok, findings: [summary, ...findings] };
  }
  return { ok, findings };
}

/**
 * A verdict from a finding list under a ratchet: it holds while the count of ERROR
 * findings does not exceed the threshold (default 0, i.e. strict) — or, for an `up`
 * ratchet, does not fall below it. The ratchet
 * is how a rule is armed against a live repository — set to the current count of
 * violations, it passes today and fails on any increase. Info/warning findings
 * never fail it. Delegates to `frameTolerated` so a tolerated pass is framed.
 *
 * It also STATES the measurement on the verdict rather than leaving the engine to
 * re-derive it. The two agree here, so nothing changes for a check built this way —
 * but stating it is what lets a check whose count is not its finding count (one that
 * summarises, or measures a score) use the same path instead of inventing a private
 * channel to the ratchet store, which is exactly what three checks did before this
 * field existed, and their thresholds would have been reset to zero for it.
 */
export function verdictFrom(findings: readonly IFinding[], ratchet: number | IThreshold = 0): IVerdict {
  const { threshold, direction = 'down' } = typeof ratchet === 'number' ? { threshold: ratchet } : ratchet;
  const errors = findings.filter((f) => f.severity === 'error').length;
  // The direction is honoured here, where it used to be dropped: an `up` ratchet read as a
  // debt ceiling passed any count at or BELOW its bar — a score that fell was a green run.
  const framed = frameTolerated(satisfiesRatchet(errors, threshold, direction), findings, `ratchet ${threshold}`);
  return { ...framed, measured: errors };
}

/** The bar a run is held to, and which way it may move. */
export interface IThreshold {
  readonly threshold: number;
  readonly direction?: TRatchetDirection;
}

/**
 * The bar this run is held to: the stored threshold when there is one, else the ceiling
 * the check declares, else strict (0) — and the direction the check declares.
 *
 * The one reading every body shares. Each wrote `ctx.ratchet ?? options.ratchet` for
 * itself, which read the inline ceiling off the options the body closed over and never
 * the direction at all.
 */
export function thresholdOf(ctx: Pick<ICheckContext, 'threshold'>, check: Pick<ICheck, 'ratchet'>): IThreshold {
  return { threshold: ctx.threshold ?? check.ratchet?.ceiling ?? 0, direction: check.ratchet?.direction ?? 'down' };
}
