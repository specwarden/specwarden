// `lint` — the linter this repository already has, run as a check.
// Heavy, because a type-aware config builds the whole program on every run; move it to the
// fast tier if yours is quick — nothing else depends on where it sits.
import { commandCheck } from 'specwarden';

export const check = commandCheck({
  tier: 'heavy',
  cmd: 'npm run lint',
  rule: 'Nothing merges while the linter is red.',
  hint: 'Fix the findings, or change the lint config deliberately — never silence a rule in passing.',
});
