/**
 * `doc-hygiene` — the document stays readable as it grows.
 *
 * Relative links that resolve, section pointers that exist, and no table cell that has
 * quietly become a paragraph. The fat-cell budget is a RATCHET, not a verdict: it holds
 * at today's count and fails on an increase, so an existing corpus is not a wall of
 * findings on day one.
 */
import { docHygiene } from '@specwarden/docs';

export const check = docHygiene({
  id: 'doc-hygiene',
  title: 'documentation stays readable',
  tier: 'fast',
  docs: '**/*.md',
});
