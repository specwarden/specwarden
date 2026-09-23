/**
 * `unit` — the test suite, run through the harness.
 *
 * Wrapped rather than reimplemented: the suite is the repository's, and the harness
 * only decides WHEN it runs and reports the verdict beside every other gate.
 */
import { commandCheck } from 'specwarden';

export const check = commandCheck({
  id: 'unit',
  title: 'unit tests pass',
  tier: 'heavy',
  cmd: 'pnpm test',
  when: () => true,
  // A suite that accepts `--shard=i/N` can say `shardable: true` and the run's shard
  // is appended. Before sharding a gate that enforces something GLOBAL — a coverage
  // floor, a whole-repo audit — remember that a shard sees only its own slice.
  hint: 'A failing test is the finding. Read it before reading anything here.',
});
