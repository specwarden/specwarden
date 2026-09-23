---
name: specwarden-ops
description: Use when a repository has infrastructure that can drift silently — env files across environments, proxy upstreams, CI jobs against a gate list, Docker build order, shell scripts.
---

# specwarden-ops

`@specwarden/ops`

Each of these catches a drift whose symptom appears somewhere other than where it was
caused — which is why none of them is noticed by review.

| Check                   | Catches                                                                          |
| ----------------------- | -------------------------------------------------------------------------------- |
| `envFilesAgree`         | a key the sender has and the verifier lacks, or two values for one key           |
| `upstreamsResolve`      | a proxy upstream that cannot resolve where the proxy runs — loopback vs. service |
| `gatesHaveCiJobs`       | a heavy gate with no CI job, or a job that never reaches the arbiter             |
| `buildOrderFollowsDeps` | a Dockerfile building a workspace package before what it imports                 |
| `shellLocalScope`       | `local` outside a function, which aborts the script at runtime                   |

## The one worth wiring first

`gatesHaveCiJobs`. A gate added to the local hook and not to CI, or added to a job that
nothing depends on, is a gate that runs where nobody is watching and not where the merge
button is. It reads the engine's own roster, so it cannot disagree with what actually
runs:

```js
import { gatesHaveCiJobs } from '@specwarden/ops';

export const check = gatesHaveCiJobs({
  id: 'gate-coverage',
  title: 'every heavy gate has a CI job, and every gate job reaches the arbiter',
  workflow: '.github/workflows/ci.yml',
  arbiterJob: 'ci-ok',
});
```

`ciTier` defaults to `heavy`, `cheapTier` to `fast`, and `runnerPattern` to the engine's
own command (`specwarden check`, `spw check`, `warden.mjs check`); name them only when the
workflow differs. A job runs the cheap tier when that command carries `--tier fast`.

## What each option must be

Every factory refuses an option it does not have, by name, when the file loads — `arbiter`
for `arbiterJob` is a load error, not a check reporting `undefined`. `when` and `tier` are
optional everywhere. Read the GUIDE's table for a check before writing one; the facts it
asks for (which workflow, which service verifies, which modes run the proxy on the host)
are the repository's, and a guess is a finding nobody can act on.

## `envFilesAgree` compares VALUES across one stack, and KEYS against the verifier

Two files one stack loads together must agree on every key they share — a different value
is a service that boots green and fails against the other. And a key your application
declares (`declaredKeys`), set in a sending service's file, must be present and non-empty
in the verifier's. `declaredKeys` reads your own declaration through the file port:

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

## `upstreamsResolve` is about WHERE the proxy runs

A host-mode proxy may only name a loopback address; a container-mode proxy may only name
a service. `hostModes` is the one fact it cannot infer. If no mode's file is found it
fails — `fileFor` is pointed at the wrong place.

## Refuse to

- put a value in the check's configuration to make the comparison pass;
- exempt an env file because it is "special" — if it genuinely has a different shape, it
  is a different stack, and saying so is one option away;
- widen `loopbackHosts` or `hostModes` to silence a finding without deciding where the
  proxy actually runs.
