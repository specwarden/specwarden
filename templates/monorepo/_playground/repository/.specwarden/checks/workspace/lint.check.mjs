/**
 * `lint` — the linter this repository already has, run through the harness.
 *
 * HEAVY rather than fast, and that is a judgement: a type-aware config builds the whole
 * program on every invocation, so file count barely matters and there is no cheap "lint
 * only what changed". Move it to the fast tier if yours is quick — nothing else depends
 * on where it sits.
 */
import { commandCheck } from 'specwarden';

export const check = commandCheck({
  id: 'lint',
  title: 'the linter passes',
  tier: 'heavy',
  cmd: 'pnpm run lint',
  when: () => true,
  hint: 'Fix the findings, or change the lint config deliberately — never silence a rule in passing.',
});
