import type { ITemplateContext } from 'specwarden';

import type { IPart } from '../_shared/part.model';

/**
 * "Each document sits where its kind belongs" — as an `.example`, because the CONTRACT
 * is the repository's.
 *
 * Nothing about a document's kind is universal: one house keeps runbooks beside the
 * scripts they run, another keeps every operational document in one folder. This check
 * at least fails LOUDLY when left unconfigured — an empty contract describes no
 * location, so every document is a finding — but a check that fails a correct tree
 * teaches people to switch the harness off, which costs more than the check was worth.
 */
export const docPlacementExamplePart = (ctx: ITemplateContext): IPart => ({
  files: [
    {
      path: 'checks/docs/doc-placement.check.mjs.example',
      body: `/**
 * \`doc-placement\` — each document sits where its kind belongs.
 *
 * A document in the wrong place is a document two readers disagree about the authority
 * of: is this the rule, or somebody's notes? The answer should be its path.
 *
 * A location the contract does not describe is not WRONG — it is undecided, and an
 * undecided location is where a partial second copy of a rule is born. Either the
 * contract gains a row, or the file moves.
 *
 * WHY IT IS AN EXAMPLE. The list below is your placement contract, and there is no
 * universal one. Write the contract down somewhere a person can argue with it — that
 * document is what this check enforces, and a rule whose rationale lives nowhere is a
 * rule nobody can change on purpose.
 *
 * Note the failure direction: an EMPTY list matches nothing, so every document is a
 * finding. Loud rather than silent, which is the right way round for a check waiting on
 * a decision. Rename to \`.check.mjs\` once the list is real.
 */
import { docPlacement } from 'specwarden-module-docs';

export const check = docPlacement({
  id: 'doc-placement',
  title: 'every document sits where its kind belongs',
  tier: '${ctx.tier}',
  docs: '${ctx.docs}',
  // A document must match ONE of these. Regexes rather than globs: a contract's shapes
  // — alternations, anchored names — exceed what a glob can say.
  allowed: [
    /^README\\.md$/,
    /^docs\\/.*\\.md$/,
    // …one row per document KIND, and a comment saying which kind it is.
  ],
  // Optional inbound-link ban: nothing outside \`dir\` may link INTO it. For a folder
  // whose files are deleted when their work ends, every inbound pointer is a delayed
  // dangling one.
  // link: { pattern: /\\(\\.\\.\\/_plans\\/([^)]+)\\)/g, dir: 'docs/_plans/', allow: 'README.md' },
});
`,
    },
  ],
  rules: [],
});
