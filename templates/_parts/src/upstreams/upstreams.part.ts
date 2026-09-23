import type { ITemplateContext } from 'specwarden';
import type { IPart } from '../_shared/part.model';
import { exampleRule, header, literal, switchOn, tierOption } from '../_shared/render.util';

/**
 * The reverse proxy points at something that exists — as an `.example`.
 *
 * The rule is universal and the vocabulary is not: which modes run the proxy on the HOST
 * (where `localhost` is right) and which among the services (where it is a loopback into
 * the proxy's own container) is a fact about one deployment. The config is the one `init`
 * found; the check reads Caddy's `reverse_proxy`, and says so where the file is not one.
 */
export const upstreamsExamplePart = (ctx: ITemplateContext): IPart => {
  const found = ctx.proxyConfigs?.[0];
  const caddy = found === undefined || /caddy/i.test(found);
  const fileFor = found
    ? `  // The config init found. Several modes? Return each one's file.
  fileFor: () => ${literal(found)},
`
    : `  // REPLACE: each mode's proxy config.
  fileFor: (mode) => \`Caddyfile.\${mode}\`,
`;
  const reads = caddy
    ? 'It reads Caddy `reverse_proxy` lines.'
    : "It reads Caddy `reverse_proxy` lines, not nginx's: over this file it finds no upstream and fails.";
  return {
    files: [
      {
        path: 'checks/ops/upstreams-resolve.check.mjs.example',
        body: `${header(
          '`upstreams-resolve` — every proxy upstream resolves where the proxy runs.',
          `OFF until \`modes\` and \`hostModes\` say where YOUR proxy runs: in a container, \`localhost\` is the
proxy itself; on the host, a service name resolves to nothing.
${reads}
${switchOn('upstreams-resolve')}`,
        )}
import { upstreamsResolve } from '@specwarden/ops';

export const check = upstreamsResolve({
  id: 'upstreams-resolve',
${tierOption(ctx)}  modes: ['prod'],
${fileFor}  // REPLACE: the modes whose proxy runs on the HOST — only these may name a loopback address.
  hostModes: [],
});
`,
      },
    ],
    rules: [exampleRule('upstreams-resolve', 'Every proxy upstream resolves where the proxy runs.')],
  };
};
