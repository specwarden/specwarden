import type { ITemplateContext } from 'specwarden';

import type { IPart } from '../_shared/part.model';

/**
 * The reverse proxy points at something that exists — as an `.example`.
 *
 * The rule is universal and the vocabulary is not: which modes run the proxy on the
 * HOST (where `localhost` is right) and which run it among the services (where it is a
 * dead loopback into the proxy's own container) is a fact about one deployment. Guessed
 * either way, the check is wrong in half the repositories that install it.
 */
export const upstreamsExamplePart = (ctx: ITemplateContext): IPart => ({
  files: [
    {
      path: 'checks/ops/upstreams-resolve.check.mjs.example',
      body: `/**
 * \`upstreams-resolve\` — every proxy upstream resolves where the proxy actually runs.
 *
 * A container-mode proxy pointing at \`localhost:3000\` resolves to ITSELF, and the
 * request dies with a 502 that names no service. A host-mode proxy pointing at a
 * service NAME resolves to nothing at all. The two mistakes are symmetrical and both
 * look like the upstream being down.
 *
 * WHY IT IS AN EXAMPLE. Which of your modes run the proxy on the host is a deployment
 * fact. Left empty, every mode is treated as containerised and a legitimate
 * \`localhost\` upstream becomes a false failure — which teaches a team to skip the
 * gate, and a skipped gate protects nothing.
 *
 * Name the modes, point \`fileFor\` at each mode's config, rename to \`.check.mjs\`.
 */
import { upstreamsResolve } from '@specwarden/ops';

export const check = upstreamsResolve({
  id: 'upstreams-resolve',
  title: 'every proxy upstream resolves where the proxy runs',
  tier: '${ctx.tier}',
  modes: ['local', 'prod'],
  fileFor: (mode) => \`caddy/Caddyfile.\${mode}\`,
  // The modes where the proxy runs on the HOST, beside the services rather than among
  // them. Only these may name a loopback address.
  hostModes: ['local'],
  loopbackHosts: ['localhost', '127.0.0.1'],
  when: (changed) => changed.some((f) => f.includes('Caddyfile') || f.includes('nginx')),
  hint: 'Point at the service name in a containerised mode, and at the port on the host.',
});
`,
    },
  ],
  rules: [],
});
