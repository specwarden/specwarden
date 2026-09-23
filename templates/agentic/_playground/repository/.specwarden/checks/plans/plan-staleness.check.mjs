// `plan-staleness` — a finished plan leaves the live corpus, and nothing cites the archive.
// A plan that stays is read as current work. It reads a `**Status:**` / `**Branch:**` header;
// another convention is `statusDeclaration` and `branchDeclaration`.
import { planStaleness } from '@specwarden/plans';

export const check = planStaleness({
  plansDir: 'docs/_plans',
  archiveDir: 'docs/_plans-archive',
  rule: 'A plan is archived when its work ends; nothing outside the archive cites it.',
});
