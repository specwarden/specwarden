/**
 * `decision-log-shape` — a rejected alternative carries the reason it was rejected.
 *
 * The reason is the one fact in a decision log that exists nowhere else. The decision
 * itself ends up in the code; what was considered and DISCARDED, and why, survives only
 * here — and it is the first thing someone reopening the question needs, six months
 * later, usually to propose the rejected option again.
 *
 * A reason is an assertion, not an apology. "Too slow" is a reason; "we did not have
 * time" is a schedule.
 */
import { decisionLogShape } from '@specwarden/plans';

export const check = decisionLogShape({
  id: 'decision-log-shape',
  title: 'every rejected alternative says why',
  tier: 'fast',
  docs: 'docs/**/*.md',
});
