// `unit` — the test suite this repository already has, run through the harness.
// A suite that accepts `--shard=i/N` can say `shardable: true`; a shard sees only its own slice.
import { commandCheck } from 'specwarden';

export const check = commandCheck({
  tier: 'heavy',
  cmd: 'npm test',
  rule: 'Nothing merges while the test suite is red.',
  hint: 'A failing test is the finding. Read it before reading anything here.',
});
