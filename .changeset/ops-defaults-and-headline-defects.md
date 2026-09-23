---
'@specwarden/ops': minor
---

Defaults for what is the same in every repository: `gatesHaveCiJobs` needs only `workflow` and `arbiterJob` (`ciTier` is `heavy`, `cheapTier` is `fast`, `runnerPattern` is the engine's own command, exported as `DEFAULT_RUNNER_PATTERN`); `upstreamsResolve`'s `loopbackHosts` defaults to `DEFAULT_LOOPBACK_HOSTS` (`localhost`, `127.0.0.1`, `[::1]`); `shellLocalScope` reads every tracked `.sh` when `pathspecs` is not given.

Verdict changes, each a check that was blind to the defect it is named for:

- `envFilesAgree` refuses a declared key that a sending service's env file sets and the verifier's file lacks, with no mounted config at all — it was found only through a mount's interpolation, so the commonest stack was green. An EMPTY value in the verifier's file is reported as missing, not as a differing value. A mounted `Caddyfile` is now read, for `${VAR}` and for Caddy's own `{$VAR}`. An empty `verifierService` is reported as not set, and a verifier whose env file is absent is noted as "could not be compared".
- `upstreamsResolve` FAILS when no mode's file exists — `fileFor` is pointing at nothing — instead of passing with SKIPPED lines. Some modes absent is still a SKIPPED note.
- `gatesHaveCiJobs` recognises the cheap tier from the engine's invocation (`specwarden check`, `spw check`, `warden.mjs check`) followed by `--tier fast` or `--tier=fast`, as well as from your `runnerPattern`. A correct workflow was red under the scaffolded pattern, which ends in `--id (\S+)`.
