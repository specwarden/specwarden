import type { ITemplateContext } from 'specwarden';

import type { IPart } from '../_shared/part.model';

/**
 * "Every key a service reads is a key its env file sets" — as an `.example`, and only
 * where a compose file exists at all.
 *
 * Two gates on it, not one. Without a compose file there is nothing to reconcile, so
 * the check would read an absent file and report success. With one, it still needs the
 * repository to say how its application DECLARES a key — an enum, a schema, a constant
 * object — and no engine can guess that. So: written when there is a compose file,
 * always as an example, with the one function to fill in named at the top.
 */
export const envFilesExamplePart = (ctx: ITemplateContext): IPart => {
  if (ctx.composeFiles.length === 0) return { files: [], rules: [] };
  return {
    files: [
      {
        path: 'checks/ops/env-files-agree.check.mjs.example',
        body: `/**
 * \`env-files-agree\` — a key the application reads is a key the env file sets.
 *
 * The failure is quiet on both sides: a missing key arrives as \`undefined\` and the
 * service starts anyway, usually degrading rather than crashing, and a key set in one
 * mode's file but not another's works on the machine you tested and nowhere else.
 *
 * WHY IT IS AN EXAMPLE. \`declaredKeys\` has to read the place YOUR application declares
 * its environment — an enum, a zod schema, a constants file. That is one function, and
 * it is the whole configuration: written to return an empty set, the check compares
 * nothing against everything and passes.
 *
 * Fill it in, confirm the modes and the verifier service, and rename to \`.check.mjs\`.
 */
import { envFilesAgree } from '@specwarden/ops';

export const check = envFilesAgree({
  id: 'env-files-agree',
  title: 'every key a service reads is set for every mode it runs in',
  tier: '${ctx.tier}',
  composeFile: '${ctx.composeFiles[0]}',
  // The deployment modes whose files are compared, substituted into \${MODE}.
  modes: ['dev', 'prod'],
  // The service that VERIFIES a handshake key another service sends — the pair that
  // must hold the same value rather than merely both hold one.
  verifierService: '',
  // WHERE YOUR APPLICATION DECLARES ITS KEYS. Returning an empty set makes this check
  // compare nothing against everything, and report green.
  declaredKeys: (read) => new Set(Object.keys(JSON.parse(read('config/env.schema.json') ?? '{}'))),
  when: (changed) => changed.some((f) => f.includes('env') || f.includes('compose')),
  hint: 'Add the key to every mode file, or stop reading it.',
});
`,
      },
    ],
    rules: [],
  };
};
