# @specwarden/ops — guide

Five checks over operational configuration: environment files, reverse-proxy upstreams,
CI job coverage, workspace build order, and shell scoping.

Each assumes a stack — compose files, a proxy config, GitHub Actions, a pnpm workspace.
That is precisely why they are not in the engine: an assumption about a stack is the
fastest way for a product zone to stop being portable.

**Every defect here loads cleanly, boots green, and is wrong.** That is the family these
five belong to.

## Install and wire

```bash
pnpm add -D @specwarden/ops
```

## `envFilesAgree` — the sender has the secret and the verifier does not

The production defect this was written for: one service signs a request with a key, the
other verifies it, only one file carries the key, both services start, and every request
is refused.

```js
envFilesAgree({
  id: 'env-pairing',
  title: '…',
  tier: 'fast',
  composeFile: 'docker-compose.yml',
  modes: ['prod'],
  verifierService: 'be',
  declaredKeys: (read) => keysFrom(read('src/env.ts')),
  when: () => true,
});
```

It catches four things: a key the verifier lacks, an empty value in the verifier file
(treated as missing), two different values for one key, and a variable a mounted config
interpolates that its own service's env file does not carry.

A mode whose files are absent is reported as **SKIPPED**, not as a pass — env files are
usually gitignored, and a mode reported clean would be a green nobody earned.

A key that both files carry must carry the same value; give each service its own key
where they genuinely differ (`BE_PORT`, `EDGE_PORT`), rather than one name with two
values.

## `upstreamsResolve` — an address that resolves where its proxy runs

```js
upstreamsResolve({
  id: 'caddy-upstreams',
  title: '…',
  tier: 'fast',
  modes: ['local', 'prod'],
  fileFor: (mode) => `caddy/Caddyfile.${mode}`,
  hostModes: ['local'],
  loopbackHosts: ['localhost', '127.0.0.1', '[::1]'],
  when: () => true,
});
```

Both directions are errors: a container service name in a host-mode file has no DNS, and
a loopback address in a deployed file points the container at itself. An interpolated
upstream (`{$VAR}`) is left alone — a guess there is a finding nobody can act on.

A file with no upstream at all **fails**: a config whose upstreams stopped being found is
a check reporting success about nothing.

## `gatesHaveCiJobs` — every heavy gate is run by a job the arbiter waits for

```js
gatesHaveCiJobs({
  id: 'gate-coverage',
  title: '…',
  tier: 'fast',
  workflow: '.github/workflows/ci.yml',
  arbiterJob: 'ci-ok',
  ciTier: 'heavy',
  cheapTier: 'fast',
  runnerPattern: String.raw`warden\.mjs\s+check`,
  when: () => true,
});
```

`gates` defaults to the run's own roster. It catches a heavy gate no job runs, a gate id
the roster does not have (a typo runs nothing), a fast gate named in the heavy workflow
(it runs twice, on the wrong schedule), a gate job outside the arbiter's `needs` (it can
be red while the arbiter is green), and a workflow where no job runs the cheap tier — a
client-side hook can be skipped.

It fails rather than passes when the workflow cannot be read, when the scan yields no
jobs, and when no gate id is recognisable.

## `buildOrderFollowsDeps` — an image builds a package after what it imports

```js
buildOrderFollowsDeps({
  id: 'workspace-build-order',
  title: '…',
  tier: 'fast',
  packagesDir: 'packages',
  scopePrefix: '@app/',
  containerFiles: '*Dockerfile*',
  buildInvocation: String.raw`--filter\s+(@app\/[a-z0-9-]+)\s+run\s+build`,
  when: () => true,
});
```

Both real cases: an image that never builds a dependency, and one that builds it a line
too late. Both compile from a warm local checkout and fail in a clean image — which is
the only place it runs. Reading no manifests at all is a failure, not a clean tree.

## `shellLocalScope` — `local` only inside a function

`local` outside a function is a run-time error in bash, in the deploy script, on the
deploy. The scan understands heredocs (data, and the reported line stays true), nested
definitions, one-line definitions and indented ones. A scan that matched no files fails.

```js
shellLocalScope({ id: 'shell-local-scope', title: '…', tier: 'fast', pathspecs: ['scripts/*.sh'], when: () => true });
```

## Exports

The barrel names its exports rather than star-re-exporting. Two checks both export a
`violationsFor`; the upstream one is prefixed `upstreamViolationsFor`, because a caller
reaching for the bare name almost always means the build-order one.
