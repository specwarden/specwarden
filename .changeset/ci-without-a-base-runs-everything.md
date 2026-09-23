---
'specwarden': minor
---

Under CI with no `--base`, an empty range of unpushed commits is "cannot tell", so the run is full and prints why (`under CI with no --base, the unpushed range is empty …`). A CI checkout builds a commit that is already pushed, so that range is empty by construction: `check` there without `--all` ran only the always-on checks and exited 0. `--relevance` answers from the same rule. Pass `--base <ref>` for a filtered pull-request run.

CI is now any `CI` other than empty, `false` or `0` — it was only `CI=true`, so under `CI=1` a `SPECWARDEN_SKIP` reached the arbiter — and `GITHUB_ACTIONS=true`, where any value used to count, `false` included.

A CI job may now run, and fail, checks it silently skipped before; they are the checks it was meant to run.
