// `plan-shape` — phases express dependency, not effort, and each says how it is accepted.
// A sizing word turns a work order into a bid. The phase heading, sizing and acceptance patterns
// are English defaults: `phaseHeading`, `sizing` and `command` replace them.
import { planShape } from '@specwarden/plans';

export const check = planShape({
  plansDir: 'docs/_plans',
  rule: 'Phases express dependency and deployability, and each names how it is accepted.',
});
