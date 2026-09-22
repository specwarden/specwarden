---
name: specwarden-ops
description: Use when a repository has infrastructure that can drift silently — env files across environments, proxy upstreams, CI jobs against a gate list, Docker build order, shell scripts.
---

# specwarden-ops

`@specwarden/ops`

Each of these catches a drift whose symptom appears somewhere other than where it was
caused — which is why none of them is noticed by review.

| Check                   | Catches                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `envFilesAgree`         | a key added to one environment's env file and not the others         |
| `upstreamsResolve`      | a proxy upstream naming a service that does not exist                |
| `gatesHaveCiJobs`       | a heavy gate with no CI job, or a job that never reaches the arbiter |
| `buildOrderFollowsDeps` | a Dockerfile building a workspace package before what it imports     |
| `shellLocalScope`       | `local` outside a function, which aborts the script at runtime       |

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
  tier: 'fast',
  workflow: '.github/workflows/ci.yml',
  arbiter: 'ci-ok',
});
```

## `envFilesAgree` compares KEYS, never values

A value is a secret or an environment's own business. What must agree is the shape: a key
present in staging and missing in production is a service that starts and then fails on
the first request that needs it.

## Refuse to

- put a value in the check's configuration to make the comparison pass;
- exempt an env file because it is "special" — if it genuinely has a different shape, it
  is a different group, and saying so is one option away.
