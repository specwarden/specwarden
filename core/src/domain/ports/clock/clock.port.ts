/**
 * The time port. Two questions, kept apart on purpose: `now()` is wall-clock
 * time, used where a date is the datum (a plan's staleness, a baseline stamp);
 * `monotonicMs()` is for measuring durations, where wall-clock is the wrong tool
 * because it can jump backwards. Injecting time is also what lets a test pin
 * "now" instead of racing it.
 */
export interface IClock {
  now(): Date;
  /** A monotonically non-decreasing millisecond counter for elapsed-time math. */
  monotonicMs(): number;
}
