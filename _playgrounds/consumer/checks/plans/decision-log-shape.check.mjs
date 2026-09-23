import { decisionLogShape } from '@specwarden/plans';

export const check = decisionLogShape({
  id: 'decision-log-shape',
  title: 'a rejection states why',
  tier: 'fast',
  docs: 'docs/_plans/*.md',
});
