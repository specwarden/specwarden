/**
 * ONE deployment repository, in two states.
 *
 * The five checks in this package do not each get their own fixture, deliberately. They
 * read the SAME repository from five angles — a compose file, the env files it names, the
 * proxy config it mounts, the image that builds it and the workflow that gates it — and a
 * fixture per check would let those angles drift apart until the playground stopped
 * describing any repository a person could have.
 *
 * TWO states, because a check returning the same verdict for both cannot fail, and a
 * check that cannot fail reports success. `BROKEN` carries one defect per check, each of
 * them a shape that actually shipped somewhere: the config loads, the container boots,
 * and the thing is wrong.
 */

/** The compose file. Two services: one behind the proxy, one that verifies the handshake. */
const COMPOSE = `services:
  api:
    image: example/api
    env_file:
      - api/.env.\${MODE}
  edge:
    image: example/edge
    env_file:
      - .env.\${MODE}
    volumes:
      - ./edge/config.yml:/etc/edge/config.yml:ro
`;

/** The proxy's own config, mounted into `edge` — and interpolating a key from ITS env. */
const EDGE_CONFIG = 'auth:\n  secret: ${EDGE_SECRET}\n';

/** The workspace graph the image has to respect: contracts imports i18n. */
const MANIFESTS: Record<string, string> = {
  'packages/contracts/package.json': JSON.stringify({
    name: '@org/contracts',
    dependencies: { '@org/i18n': 'workspace:*' },
  }),
  'packages/i18n/package.json': JSON.stringify({ name: '@org/i18n' }),
};

/** A workflow that runs the cheap tier, fans the heavy gates out, and gathers them. */
const WORKFLOW = (gates: readonly string[]): string => `name: ci

on:
  push:
    branches: [main]

jobs:
  guards:
    steps:
      - run: node node_modules/specwarden/bin/warden.mjs check --tier fast

  gates:
    strategy:
      matrix:
        gate: [${gates.join(', ')}]
    steps:
      - run: node node_modules/specwarden/bin/warden.mjs check --id \${{ matrix.gate }}

  ci-ok:
    needs: [guards, gates]
    steps:
      - run: echo done
`;

/** A repository where every one of these five checks is satisfied. */
export const CLEAN: Record<string, string> = {
  ...MANIFESTS,
  'docker-compose.yml': COMPOSE,
  'edge/config.yml': EDGE_CONFIG,
  // Both files carry the shared secret, with the same value. The verifier having it is
  // the whole point: a sender-only secret boots green and refuses every request.
  // A key each file owns alone is fine; a key BOTH carry must carry the same value, so
  // the port is named per service rather than twice with two values.
  '.env.prod': 'EDGE_SECRET=s\nEDGE_PORT=8080\n',
  'api/.env.prod': 'EDGE_SECRET=s\nAPI_PORT=3000\n',
  // Local runs the proxy ON THE HOST, so it names loopback; deployed runs it among the
  // services, so it names the service. Each file is wrong in the other's world.
  'caddy/Caddyfile.local': 'reverse_proxy localhost:3000\n',
  'caddy/Caddyfile.prod': 'reverse_proxy api:3000\n',
  // i18n before contracts, because contracts imports it.
  Dockerfile:
    'FROM node:24-alpine\nRUN pnpm --filter @org/i18n run build \\\n    && pnpm --filter @org/contracts run build\n',
  '.github/workflows/ci.yml': WORKFLOW(['api-unit', 'web-unit']),
  'scripts/deploy.sh':
    '#!/usr/bin/env bash\nset -Eeuo pipefail\n\nmain() {\n  local target\n  target="$1"\n  echo "$target"\n}\n\nmain "$@"\n',
};

/** The same repository with one defect per check. */
export const BROKEN: Record<string, string> = {
  ...CLEAN,
  // env-pairing: the SENDER has the secret and the VERIFIER does not. This is the defect
  // the check was written for — both services start, and every signed request is refused.
  'api/.env.prod': 'API_PORT=3000\n',
  // caddy-upstreams: a container service name in the file whose proxy runs on the host.
  // DNS for `api` does not exist there, so it is a 502 on a page that never opened.
  'caddy/Caddyfile.local': 'reverse_proxy api:3000\n',
  // workspace-build-order: contracts built before the package it imports. Compiles from a
  // warm local checkout, fails in a clean image — which is the only place it runs.
  Dockerfile:
    'FROM node:24-alpine\nRUN pnpm --filter @org/contracts run build\nRUN pnpm --filter @org/i18n run build\n',
  // gate-coverage: a heavy gate no job names. It is not run, and nothing says so.
  '.github/workflows/ci.yml': WORKFLOW(['api-unit']),
  // shell-local-scope: `local` in the main block, which is not a function. Bash refuses
  // it at run time, in the deploy script, on the deploy.
  'scripts/deploy.sh': '#!/usr/bin/env bash\nset -Eeuo pipefail\n\nlocal target\ntarget="$1"\necho "$target"\n',
};

/** The heavy gates CI is reconciled against. */
export const GATES = [
  { id: 'api-unit', title: 'API unit', tier: 'heavy' },
  { id: 'web-unit', title: 'web unit', tier: 'heavy' },
];

/** The factories this playground claims to exercise. */
export const COVERED = [
  'envFilesAgree',
  'upstreamsResolve',
  'gatesHaveCiJobs',
  'buildOrderFollowsDeps',
  'shellLocalScope',
];
