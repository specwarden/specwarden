// `doc-hygiene` — links resolve, section pointers exist, a table cell stays a cell.
// A corpus stops being read through structural decay long before anybody says so.
// `ratchet` is how many over-long table rows are tolerated; it only turns down.
import { docHygiene } from '@specwarden/docs';

export const check = docHygiene({
  docs: '**/*.md',
  rule: 'A document keeps its links resolving and its tables tables.',
});
