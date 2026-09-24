<!-- GENERATED from modules/ops/GUIDE.md. Edit the guide. -->

# @specwarden/ops — guide

Five checks over operational configuration. Each assumes a stack — compose files, a Caddy
config, GitHub Actions, a pnpm workspace, bash — which is why they are a module and not the
engine: an assumption about a stack is the fastest way for a check to stop being portable.

## What it catches

**Every defect here loads cleanly, boots green, and is wrong.**

| Check             | Factory          | Catches                                                                                     |
| ----------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| `env-pairing`     | `envPairing`     | a key the sender has and the verifier lacks, two values for one key, an empty interpolation |
| `proxy-upstreams` | `proxyUpstreams` | an upstream that cannot resolve where the proxy runs — loopback vs. service name            |
| `ci-coverage`     | `ciCoverage`     | a heavy check no CI job runs, a job the required job does not wait for, no cheap tier       |
| `build-order`     | `buildOrder`     | an image building a workspace package before the packages it imports                        |
| `shell-scope`     | `shellScope`     | `local` outside a function, which aborts the script at run time                             |

## Wiring

```bash
pnpm add -D @specwarden/ops
```

The whole module in one file — every check is built unless it is told `false`, so a stack
you do not have is one line:

```js
// .specwarden/checks/ops/ops.check.mjs
import { opsChecks, parseEnvFile } from '@specwarden/ops';

export const checks = opsChecks({
  envPairing: {
    composeFile: 'docker-compose.yml',
    modes: ['prod'],
    verifierService: 'be',
    declaredKeys: (read) => new Set(parseEnvFile(read('.env.example') ?? '').keys()),
  },
  proxyUpstreams: {
    modes: ['local', 'prod'],
    fileFor: (mode) => `caddy/Caddyfile.${mode}`,
    hostModes: ['local'],
  },
  ciCoverage: { workflowFile: '.github/workflows/ci.yml', requiredJob: 'ci-ok' },
  buildOrder: {
    packagesDir: 'packages',
    scopePrefix: '@acme/',
    containerFiles: '*Dockerfile*',
    buildInvocation: /--filter\s+(@acme\/[a-z0-9-]+)\s+run\s+build/,
  },
  shellScope: {},
});
```

Or one check per file, with only the facts it cannot default:

```js
// .specwarden/checks/ops/shell-scope.check.mjs
import { shellScope } from '@specwarden/ops';

export const check = shellScope({ scripts: ['scripts/**/*.sh'] });
```

A check's id is its factory's name in kebab case (`env-pairing`, `ci-coverage`, …), and it
carries the rule the package implies, owned by `@specwarden/ops`. Write `id` or `rule` only
to say something else. The engine discovers any file under `checks/` at any depth.

## Options

Every factory takes the engine's identity beside its own options — `id`, `title`, `tier`
(default `fast`), `when` (default: always relevant), `hint`, `advisory`, `rule` and
`ratchet` — plus `corpus: { atLeast }`, how many units a run must examine (default 1). It
refuses `zone`, an option it does not have, an empty list and a value of the wrong kind,
by name, when the file loads. A misspelled option used to be dropped in silence, and the
check ran without it.

**`opsChecks`** takes `tier` and `when`, applied to every check it builds, and one entry
per check: its options (laid over the preset's `tier` and `when`), or `false` to leave it
out. A missing entry is refused, naming what the check needs.

### `envPairing` — units: compose services

| Option            | Kind                               | Default    |
| ----------------- | ---------------------------------- | ---------- |
| `composeFile`     | file                               | — required |
| `modes`           | strings, substituted for `${MODE}` | — required |
| `verifierService` | compose service name               | — required |
| `declaredKeys`    | `(read) => Set<string>`            | — required |

`declaredKeys` is how YOUR application declares its environment, read through the file
port: a sample env file as above, a JSON schema
(`new Set(Object.keys(JSON.parse(read('config/env.schema.json') ?? '{}')))`), or a
constants file matched with a pattern. It is the one function this check cannot write for
you.

### `proxyUpstreams` — units: proxy configs

| Option          | Kind                                         | Default                               |
| --------------- | -------------------------------------------- | ------------------------------------- |
| `modes`         | strings                                      | — required                            |
| `fileFor`       | `(mode) => path`                             | — required                            |
| `hostModes`     | the modes whose proxy runs on the host; `[]` | — required                            |
| `loopbackHosts` | names meaning "this machine"                 | `['localhost', '127.0.0.1', '[::1]']` |

### `ciCoverage` — units: workflow jobs

| Option          | Kind                                 | Default                                        |
| --------------- | ------------------------------------ | ---------------------------------------------- |
| `workflowFile`  | file                                 | — required                                     |
| `requiredJob`   | the job branch protection requires   | — required                                     |
| `ciTier`        | tier                                 | `heavy`                                        |
| `cheapTier`     | tier                                 | `fast`                                         |
| `runnerPattern` | RegExp matching a check-running line | `DEFAULT_RUNNER_PATTERN`, the engine's command |
| `checks`        | `() => [{ id, title, tier }]`        | the run's own roster                           |

The cheap tier is recognised from the engine's own invocation — `specwarden check`,
`spw check` or `specwarden.mjs check`, followed anywhere on its line by `--tier fast` or
`--tier=fast` — or from your `runnerPattern` followed by the same flag. A check id is read
from a matrix list (`check: [a, b]`, or `gate:` in an older workflow), an inline
`{ check: a }`, or `--id a`.

### `buildOrder` — units: container files that run a build

| Option            | Kind                              | Default    |
| ----------------- | --------------------------------- | ---------- |
| `packagesDir`     | directory                         | — required |
| `scopePrefix`     | package-name prefix, `@scope/`    | — required |
| `containerFiles`  | git pathspec                      | — required |
| `buildInvocation` | RegExp capturing the package name | — required |

### `shellScope` — units: shell files

| Option    | Kind                    | Default   |
| --------- | ----------------------- | --------- |
| `scripts` | git pathspec, or a list | `**/*.sh` |
| `except`  | git pathspecs left out  | none      |

## What fails and what passes

A clean pass prints what it examined — `✓ shell-scope — 3 shell file(s) examined, clean` —
and a run that examined fewer units than `corpus.atLeast` **fails**, because a check that
examined nothing cannot fail. Declare `corpus: { atLeast: 0 }` where an empty set is
expected. Every finding carries the file, and the line where there is one.

- **`envPairing`** fails a declared key a sending service's file sets and the verifier's
  file lacks or leaves EMPTY (reported as missing, not as a differing value); two
  different values for one key across one stack's files; and a variable a mounted config
  interpolates (`${VAR}`, or Caddy's `{$VAR}`) that its own service's env file does not
  carry — a mounted YAML, JSON, `.conf`, `.caddy` or `Caddyfile` is read. A mode with fewer
  than two of its files present is **SKIPPED** — env files are gitignored — and when no
  mode could be compared the check is reported as skipped (`cannot-tell`): not a pass, and
  not a failure on a checkout that never has the files. A compose file that cannot be read
  is below the corpus floor. A key both files carry must carry the same value; give each service
  its own key where they genuinely differ (`BE_PORT`, `EDGE_PORT`).
- **`proxyUpstreams`** fails a container service name in a host-mode file (no DNS there)
  and a loopback address in a deployed file (the container is pointing at itself). An
  interpolated upstream (`{$VAR}`) is left alone. A file with no upstream fails; a mode
  whose file is absent while another's is read is a SKIPPED note; every file absent is
  below the corpus floor — `fileFor` is pointed at the wrong place.
- **`ciCoverage`** fails a heavy check no job runs, a check id the run does not declare (a
  typo runs nothing), a check of another tier in this workflow (it runs twice), a job that
  runs checks outside the required job's `needs` (it can be red while the merge button is
  green), a missing required job, a workflow that names no check, and a workflow where no
  job runs the cheap tier — a client-side hook can be skipped.
- **`buildOrder`** fails an image that never builds a dependency and one that builds it a
  line too late; both compile from a warm checkout and fail in a clean image. No in-scope
  manifest under `packagesDir` fails, naming the scope.
- **`shellScope`** fails `local` outside every function. It understands heredocs (data,
  and the reported line stays true), nested, one-line and indented definitions.

Every check honours `ratchet`: armed with `ratchet: n`, it passes while its findings do not
exceed the stored threshold, and fails on one more.

## Exports

The barrel names its exports rather than star-re-exporting. Two checks both export a
`violationsFor`; the upstream one is prefixed `upstreamViolationsFor`, because a caller
reaching for the bare name almost always means the build-order one. The parsers —
`parseCompose`, `parseEnvFile`, `parseUpstreams`, `parseWorkflowJobs` — and
`buildSequence`, `workspaceDeps`, `functionSpans`, `localOutsideFunction` are exported for a
`declaredKeys` or a check of your own.
