import type { ITemplateContext } from 'specwarden';
import type { IPart } from '../_shared/part.model';
import { exampleRule, header, literal, switchOn, tierOption } from '../_shared/render.util';

/**
 * "Every key a service reads is a key its env file sets" — as an `.example`, and only
 * where a compose file exists at all.
 *
 * Without a compose file there is nothing to reconcile. With one, the check still needs
 * the repository to say which service VERIFIES a key another sends, and how the
 * application declares its keys; `init` reads them from a committed `.env.example` when
 * there is one, and the example says plainly what to replace when there is not.
 */
export const envFilesExamplePart = (ctx: ITemplateContext): IPart => {
  if (ctx.composeFiles.length === 0) return { files: [], rules: [] };
  const sample = ctx.envSamples?.[0];
  const declared = sample
    ? `  // The keys the application declares — here, the ones ${sample} lists.
  declaredKeys: (read) =>
    new Set((read(${literal(sample)}) ?? '').split('\\n').map((l) => l.split('=')[0].trim()).filter((k) => k && !k.startsWith('#'))),
`
    : `  // REPLACE: read the keys from where the application declares them — a schema, a constants file.
  declaredKeys: () => new Set(['DATABASE_URL']),
`;
  return {
    files: [
      {
        path: 'checks/ops/env-files-agree.check.mjs.example',
        body: `${header(
          '`env-files-agree` — a key the application reads is a key its env file sets, in every mode.',
          `OFF until \`verifierService\` names the service that VERIFIES a key another sends (it must hold
that key too) and \`modes\` are yours; it refuses an empty \`verifierService\` by name.
${switchOn('env-files-agree')}`,
        )}
import { envFilesAgree } from '@specwarden/ops';

export const check = envFilesAgree({
  id: 'env-files-agree',
${tierOption(ctx)}  composeFile: ${literal(ctx.composeFiles[0])},
  // REPLACE: the deployment modes, substituted into \${MODE} in an env_file path.
  modes: ['dev', 'prod'],
  verifierService: '',
${declared}});
`,
      },
    ],
    rules: [exampleRule('env-files-agree', 'Every key a service reads is set for every mode it runs in.')],
  };
};
