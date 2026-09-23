import { planStaleness } from '@specwarden/plans';

export const check = planStaleness({
  id: 'plan-staleness',
  title: 'no plan outlives its work',
  tier: 'fast',
  plansDir: 'docs/_plans',
  archiveDir: 'docs/_archive',
});
