import type { ITemplateContext } from 'specwarden';

import type { IPart, IPartOptions } from '../_shared/part.model';

const DEFAULT_HEADER = `a credential-shaped string anywhere in the tracked tree.
 *
 * The built-in library covers a few common vendor formats. It is a PRESET, not a
 * mandate: add your own with \`patterns.extra\`, switch one off with \`patterns.disable\`
 * (a reason is required, and it is reported), or supply the whole library with
 * \`patterns.replace\`. A match means ROTATE first, delete second.`;

/**
 * The credential scan — the one check no repository argues with.
 *
 * First in every template that has it, because a committed secret is the only finding
 * here whose cost keeps growing after the fix: the fix is a rotation, not a commit.
 */
export const secretScanPart = (ctx: ITemplateContext, o: IPartOptions = {}): IPart => ({
  files: [
    {
      path: 'checks/security/secret-scan.check.mjs',
      body: `/**
 * \`secret-scan\` — ${o.header ?? DEFAULT_HEADER}
 */
import { secretScan } from 'specwarden-module-security';

export const check = secretScan({
  id: 'secret-scan',
  title: 'no credential-shaped string is committed',
  tier: '${ctx.tier}',
});
`,
    },
  ],
  rules: [
    {
      id: 'no-credentials-in-tree',
      statement: 'A credential never enters the repository, not even a revoked one.',
      owner: '',
      enforcement: { checkIds: ['secret-scan'] },
    },
  ],
});
