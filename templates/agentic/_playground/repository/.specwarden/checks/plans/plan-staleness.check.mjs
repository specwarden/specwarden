/**
 * `plan-staleness` — a finished plan leaves the live corpus.
 *
 * A plan is ephemeral by construction: written, worked, harvested into the documents
 * that own its durable facts, then archived. One that stays is read as current work,
 * and anybody — a person, an agent — asked "what are we doing" answers with something
 * that shipped in March.
 *
 * THE DEFAULT CONVENTION is a bolded-markdown header, which is what a plan written by
 * hand already looks like:
 *
 *     **Status:** active
 *     **Branch:** feature/thing
 *
 * If yours differs, pass `statusDeclaration` / `branchDeclaration` / `activeStatuses`
 * / `archiveHeader` — the module exports its defaults as DEFAULT_* to start from.
 *
 * Delete this file if you do not plan in the repository. An inert check is worse than
 * an absent one: it looks like coverage.
 */
import { planStaleness } from '@specwarden/plans';

export const check = planStaleness({
  id: 'plan-staleness',
  title: 'a finished plan is archived, and nothing cites the archive',
  tier: 'fast',
  plansDir: 'docs/_plans',
  archiveDir: 'docs/_plans-archive',
});
