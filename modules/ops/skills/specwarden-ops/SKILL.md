---
name: specwarden-ops
description: Use when a repository has infrastructure that can drift silently — env files across environments, proxy upstreams, CI jobs against the checks they should run, Docker build order, shell scripts.
---

# specwarden-ops

`@specwarden/ops`

## When to reach for it

Each of these catches a drift whose symptom appears somewhere other than where it was
caused — which is why none of them is noticed by review. Wire the ones whose stack the
repository has.

| Check             | Factory          | Catches                                                                          |
| ----------------- | ---------------- | -------------------------------------------------------------------------------- |
| `env-pairing`     | `envPairing`     | a key the sender has and the verifier lacks, or two values for one key           |
| `proxy-upstreams` | `proxyUpstreams` | a proxy upstream that cannot resolve where the proxy runs — loopback vs. service |
| `ci-coverage`     | `ciCoverage`     | a heavy check with no CI job, or a job the required job does not wait for        |
| `build-order`     | `buildOrder`     | a Dockerfile building a workspace package before what it imports                 |
| `shell-scope`     | `shellScope`     | `local` outside a function, which aborts the script at run time                  |

The one worth wiring first is `ciCoverage`. A check added to the local hook and not to CI,
or run by a job nothing waits for, runs where nobody is watching and not where the merge
button is. It reads the engine's own roster, so it cannot disagree with what actually runs.

## The wiring

Write only the facts the check cannot know — the id, the title, the tier and the rule all
default. `ciTier` defaults to `heavy`, `cheapTier` to `fast`, and `runnerPattern` to the
engine's own command (`specwarden check`, `spw check`, `specwarden.mjs check`); name them
only when the workflow differs. A job runs the cheap tier when that command carries
`--tier fast`.

```js
import { ciCoverage } from '@specwarden/ops';

export const check = ciCoverage({
  workflowFile: '.github/workflows/ci.yml',
  requiredJob: 'ci-ok',
});
```

`envPairing` compares VALUES across one stack, and KEYS against the verifier: two files one
stack loads together must agree on every key they share, and a key the application declares
(`declaredKeys`), set in a sending service's file, must be present and non-empty in the
verifier's. `declaredKeys` reads your own declaration through the file port:

```js
import { envPairing, parseEnvFile } from '@specwarden/ops';

export const check = envPairing({
  composeFile: 'docker-compose.yml',
  modes: ['prod'],
  verifierService: 'be',
  declaredKeys: (read) => new Set(parseEnvFile(read('.env.example') ?? '').keys()),
});
```

`proxyUpstreams` is about WHERE the proxy runs: a host-mode proxy may only name a loopback
address, a container-mode proxy only a service. `hostModes` is the one fact it cannot
infer. To wire all five at once, `opsChecks({ envPairing: {…}, …, shellScope: {} })` builds
each unless it is told `false`, in one `tier`.

## What it refuses

At load, by name: an option the factory does not have (`workflow` for `workflowFile`,
`pathspecs` for `scripts`), an empty list or string (`modes: []`, `verifierService: ''`), a
source string where a RegExp belongs (`runnerPattern`, `buildInvocation`), and `zone`.

At run time, as a failure rather than a pass: a corpus below its corpus floor — no service in the
compose file, no proxy config found, no job in the workflow, no container file running a
build, no shell script. A mode whose env files are absent is SKIPPED, and a run that could
compare no mode is `cannot-tell`. `corpus: { atLeast: 0 }` accepts an empty set, in writing.

## Refuse to

- put a value in the check's configuration to make the comparison pass;
- exempt an env file because it is "special" — if it genuinely has a different shape, it
  is a different stack, and saying so is one option away;
- widen `loopbackHosts` or `hostModes` to silence a finding without deciding where the
  proxy actually runs;
- declare `corpus: { atLeast: 0 }` to quiet a check whose files moved — point it at them.
