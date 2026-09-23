<!-- GENERATED from modules/ops/GUIDE.md. Edit the guide. -->

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

```js
// .specwarden/checks/ops/ops.check.mjs
import {
  buildOrderFollowsDeps,
  envFilesAgree,
  gatesHaveCiJobs,
  parseEnvFile,
  shellLocalScope,
  upstreamsResolve,
} from '@specwarden/ops';

export const checks = [
  envFilesAgree({
    id: 'env-pairing',
    title: 'the verifier has every key the sender has',
    composeFile: 'docker-compose.yml',
    modes: ['prod'],
    verifierService: 'be',
    declaredKeys: (read) => new Set(parseEnvFile(read('.env.example') ?? '').keys()),
  }),
  upstreamsResolve({
    id: 'caddy-upstreams',
    title: 'an upstream resolves where its proxy runs',
    modes: ['local', 'prod'],
    fileFor: (mode) => `caddy/Caddyfile.${mode}`,
    hostModes: ['local'],
  }),
  gatesHaveCiJobs({
    id: 'gate-coverage',
    title: 'every heavy gate has a CI job',
    workflow: '.github/workflows/ci.yml',
    arbiterJob: 'ci-ok',
  }),
  buildOrderFollowsDeps({
    id: 'workspace-build-order',
    title: 'an image builds a package after what it imports',
    packagesDir: 'packages',
    scopePrefix: '@acme/',
    containerFiles: '*Dockerfile*',
    buildInvocation: String.raw`--filter\s+(@acme\/[a-z0-9-]+)\s+run\s+build`,
  }),
  shellLocalScope({ id: 'shell-local-scope', title: '`local` only inside a function' }),
];
```

Wire the ones whose stack you have; each is independent. The engine discovers any file
under `checks/` at any depth.

Every factory takes the engine's identity — `id`, `title`, `tier` (default `fast`),
`when` (default: always relevant), `hint`, `rule` — beside the options below, and refuses
an option it does not have, by name, when the file loads. A misspelled option was dropped
in silence before, and the check ran without it.

## `envFilesAgree` — the sender has the secret and the verifier does not

The production defect this was written for: one service signs a request with a key, the
other verifies it, only one file carries the key, both services start, and every request
is refused.

```js
import { envFilesAgree, parseEnvFile } from '@specwarden/ops';

export const check = envFilesAgree({
  id: 'env-pairing',
  title: 'the verifier has every key the sender has',
  composeFile: 'docker-compose.yml',
  modes: ['prod'],
  verifierService: 'be',
  declaredKeys: (read) => new Set(parseEnvFile(read('.env.example') ?? '').keys()),
});
```

`declaredKeys` is how YOUR application declares its environment, read through the file
port: a sample env file as above, a JSON schema
(`new Set(Object.keys(JSON.parse(read('config/env.schema.json') ?? '{}')))`), or a
constants file matched with a pattern. It is the one function this check cannot write for
you.

It compares the VALUES of the env files one stack loads together, and catches four
things:

- a declared key a sending service's file sets, missing from the verifier's file;
- the same key present but EMPTY in the verifier's file — treated as missing, and
  reported as missing, not as a differing value;
- two different values for one key across the stack's files;
- a variable a mounted config interpolates (`${VAR}`, or Caddy's `{$VAR}`) that its own
  service's env file does not carry. A mounted file is read when it is YAML, JSON, a
  `.conf`, a `.caddy`, or a `Caddyfile`.

A mode with fewer than two of its files present is reported as **SKIPPED** — env files are
usually gitignored — and a verifier whose file is absent is named as "could not be
compared". Neither is a finding, and neither says the stack is clean. When **no** mode
could be compared, the check itself is reported as skipped (`cannot-tell`): not a pass,
and not a failure on a checkout that never has the files. Run it where they live.

A key that both files carry must carry the same value; give each service its own key
where they genuinely differ (`BE_PORT`, `EDGE_PORT`), rather than one name with two
values.

| Option            | Kind                               | Default    |
| ----------------- | ---------------------------------- | ---------- |
| `composeFile`     | file                               | — required |
| `modes`           | strings, substituted for `${MODE}` | — required |
| `verifierService` | compose service name               | — required |
| `declaredKeys`    | `(read) => Set<string>`            | — required |

## `upstreamsResolve` — an address that resolves where its proxy runs

The same proxy config is written twice: for a mode where the proxy runs on the HOST beside
the services, and for a mode where it runs INSIDE the container network. `localhost:3000`
and `be:3000` are each right in exactly one of those and a 502 in the other.

```js
import { upstreamsResolve } from '@specwarden/ops';

export const check = upstreamsResolve({
  id: 'caddy-upstreams',
  title: 'an upstream resolves where its proxy runs',
  modes: ['local', 'prod'],
  fileFor: (mode) => `caddy/Caddyfile.${mode}`,
  hostModes: ['local'],
});
```

Both directions are errors: a container service name in a host-mode file has no DNS, and
a loopback address in a deployed file points the container at itself. An interpolated
upstream (`{$VAR}`) is left alone — a guess there is a finding nobody can act on.

A file with no upstream at all **fails**, and so does a run where **no** mode's file
exists: that is `fileFor` pointed at the wrong place, not a repository without a proxy. A
mode whose file is absent while another's is read is a SKIPPED note.

| Option          | Kind                                   | Default                               |
| --------------- | -------------------------------------- | ------------------------------------- |
| `modes`         | strings                                | — required                            |
| `fileFor`       | `(mode) => path`                       | — required                            |
| `hostModes`     | the modes whose proxy runs on the host | — required                            |
| `loopbackHosts` | names meaning "this machine"           | `['localhost', '127.0.0.1', '[::1]']` |

## `gatesHaveCiJobs` — every heavy gate is run by a job the arbiter waits for

```js
import { gatesHaveCiJobs } from '@specwarden/ops';

export const check = gatesHaveCiJobs({
  id: 'gate-coverage',
  title: 'every heavy gate has a CI job the arbiter waits for',
  workflow: '.github/workflows/ci.yml',
  arbiterJob: 'ci-ok',
});
```

`gates` defaults to the run's own roster. It catches a heavy gate no job runs, a gate id
the roster does not have (a typo runs nothing), a fast gate named in the heavy workflow
(it runs twice, on the wrong schedule), a gate job outside the arbiter's `needs` (it can
be red while the arbiter is green), and a workflow where no job runs the cheap tier — a
client-side hook can be skipped.

The cheap tier is recognised from the engine's own invocation — `specwarden check`,
`spw check` or `warden.mjs check`, followed anywhere on its line by `--tier fast` or
`--tier=fast` — or from your `runnerPattern` followed by the same flag.

It fails rather than passes when the workflow cannot be read, when the scan yields no
jobs, and when no gate id is recognisable.

| Option          | Kind                               | Default                                        |
| --------------- | ---------------------------------- | ---------------------------------------------- |
| `workflow`      | file                               | — required                                     |
| `arbiterJob`    | job id branch protection reads     | — required                                     |
| `ciTier`        | tier                               | `heavy`                                        |
| `cheapTier`     | tier                               | `fast`                                         |
| `runnerPattern` | RegExp SOURCE string, not a RegExp | `DEFAULT_RUNNER_PATTERN`, the engine's command |
| `gates`         | `() => [{ id, title, tier }]`      | the run's own roster                           |

## `buildOrderFollowsDeps` — an image builds a package after what it imports

```js
import { buildOrderFollowsDeps } from '@specwarden/ops';

export const check = buildOrderFollowsDeps({
  id: 'workspace-build-order',
  title: 'an image builds a package after what it imports',
  packagesDir: 'packages',
  scopePrefix: '@acme/',
  containerFiles: '*Dockerfile*',
  buildInvocation: String.raw`--filter\s+(@acme\/[a-z0-9-]+)\s+run\s+build`,
});
```

Both real cases: an image that never builds a dependency, and one that builds it a line
too late. Both compile from a warm local checkout and fail in a clean image — which is
the only place it runs. Reading no manifests at all is a failure, not a clean tree.

| Option            | Kind                                            | Default    |
| ----------------- | ----------------------------------------------- | ---------- |
| `packagesDir`     | directory                                       | — required |
| `scopePrefix`     | package-name prefix, `@scope/`                  | — required |
| `containerFiles`  | git pathspec                                    | — required |
| `buildInvocation` | RegExp SOURCE string capturing the package name | — required |

## `shellLocalScope` — `local` only inside a function

`local` outside a function is a run-time error in bash, in the deploy script, on the
deploy. The scan understands heredocs (data, and the reported line stays true), nested
definitions, one-line definitions and indented ones. A scan that matched no files fails.

```js
import { shellLocalScope } from '@specwarden/ops';

export const check = shellLocalScope({ id: 'shell-local-scope', title: '`local` only inside a function' });
```

| Option      | Kind          | Default       |
| ----------- | ------------- | ------------- |
| `pathspecs` | git pathspecs | `['**/*.sh']` |

## Exports

The barrel names its exports rather than star-re-exporting. Two checks both export a
`violationsFor`; the upstream one is prefixed `upstreamViolationsFor`, because a caller
reaching for the bare name almost always means the build-order one. The parsers —
`parseCompose`, `parseEnvFile`, `parseUpstreams`, `parseWorkflowJobs` — are exported for a
`declaredKeys` or a check of your own.
