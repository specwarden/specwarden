import type { IClock } from '../../domain';

/** The real clock. `monotonicMs` uses `performance.now()` so elapsed-time math is
 * immune to wall-clock jumps; `now` is the wall clock, for data that is a date. */
export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }

  monotonicMs(): number {
    return performance.now();
  }
}
