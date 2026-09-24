import type { TSeverity } from '../vocabulary/vocabulary.constant';

/**
 * A single machine-readable finding — the unit a check emits instead of a printed
 * string. This is one of the three things that enter the domain BEFORE the sixty
 * checks migrate, because it changes the shape every check is written in: from a
 * string you cannot build a review annotation, a machine report, or an autofix;
 * from a finding you can build all three, and the reporter owns how it looks.
 *
 * Every locational field is optional: a finding may be about a whole repository
 * (a count, a missing file) with no line to point at.
 */
export interface IFinding {
  /** Repository-relative path the finding is about, if any. */
  readonly file?: string;
  /** 1-indexed line, if the finding anchors to one. */
  readonly line?: number;
  /** 1-indexed column, if known. */
  readonly column?: number;
  readonly severity: TSeverity;
  /** Human-readable statement of the defect. Never contains a secret or an env value. */
  readonly message: string;
  /** The rule this finding enforces, linking a finding back to what it proves. */
  readonly ruleId?: string;
}

/**
 * The result of running a check: whether it held, and the findings that explain a
 * verdict either way. `ok` is the decision; `findings` is the evidence. A passing
 * check may still carry `info` findings; a failing check carries at least one
 * `error` (or `warning`, for an advisory check).
 *
 * A check NEVER prints — it returns this, and the reporter renders it. That
 * separation is what lets the same verdict become a TTY line, a CI annotation and
 * a JSON record without the check knowing which.
 */
export interface IVerdict {
  readonly ok: boolean;
  readonly findings: readonly IFinding[];
  /**
   * What this run MEASURED, for a ratcheted check — stated, rather than inferred.
   *
   * Without it the engine had exactly one way to learn a check's debt: count the
   * `error` findings. That is right for a check that emits one finding per
   * violation, which is what every built-in primitive does, and silently wrong for
   * the other shape a real check takes — summarise the violations, emit one line,
   * and report the number in words.
   *
   * A check that summarises its violations into one line writes the real count on its
   * verdict, expecting it to be read. Before this field nothing read it: such a check
   * reported zero error findings whenever it PASSED under its ratchet, so `--tighten`
   * would have rewritten a tolerated count down to 0 and failed the very next run. A field a caller
   * invents is a field the caller needed; this is that field, read where it was
   * always meant to be.
   *
   * Absent means "count the error findings", which keeps every existing check
   * correct without being touched.
   */
  readonly measured?: number;
  /**
   * The check ran and COULD NOT LOOK: what it examines is not here — env files a checkout
   * never has, a machine a CI runner is not. Its reason, in a sentence. The run reports
   * the check as skipped (`cannot-tell`), never as a pass and never as a failure.
   *
   * It is the third state a check had no way to say. Without it, "absent" was a green
   * tick beside a note reading SKIPPED — a pass nobody earned, counted as one — or a red
   * that made the check unusable on an ordinary checkout. Ignored on a verdict that is
   * not ok: a check that found a defect did look.
   */
  readonly skipped?: string;
}
