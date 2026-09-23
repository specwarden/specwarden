import type { ITemplateContext } from 'specwarden';

import type { IPart, IPartOptions } from '../_shared/part.model';
import { header, tierOption } from '../_shared/render.util';

const WHY = 'A committed key outlives its deletion in history: a match means rotate first, delete second.';

/**
 * The credential scan — the one check no repository argues with, and the first in every
 * template that has it: a committed secret is the only finding whose cost keeps growing
 * after the fix, because the fix is a rotation, not a commit.
 */
export const secretScanPart = (ctx: ITemplateContext, o: IPartOptions = {}): IPart => ({
  files: [
    {
      path: 'checks/security/secret-scan.check.mjs',
      body: `${header(
        '`secret-scan` — no credential-shaped string in any tracked file.',
        `${o.header ?? WHY}\nAdd a format with \`patterns.extra\`; switch one off with \`patterns.disable\`, which takes a reason.`,
      )}
import { secretScan } from '@specwarden/security';

export const check = secretScan({
${tierOption(ctx)}  rule: 'A credential never enters the repository, not even a revoked one.',
});
`,
    },
  ],
  rules: [],
});
