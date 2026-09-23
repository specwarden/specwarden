---
'specwarden': minor
'@specwarden/ops': minor
'@specwarden/docs': patch
'@specwarden/plans': patch
'@specwarden/security': patch
'@specwarden/agents': patch
---

**For reporter authors:** a result skipped as `cannot-tell` carries `verdict.ok: true`. A custom reporter must test `skipped` before `ok`, or it counts the result as a pass — and an exhaustive `switch` over `ICheckResult.skipped` gains a case.

A check can say it could not look, and the run reports it as skipped rather than passed.

- `IVerdict.skipped`: why this run could not examine what the check is about. With no error finding, the result is skipped with the reason `cannot-tell` (a new member of `ICheckResult.skipped`) — never a pass, never a failure, never a measurement for `--tighten`. The terminal shows it whatever `--show-skipped` says; GitHub closes its group with the reason.
- `defineCheck`: a body may return `skipped: 'why'`; the corpus floor is not applied to it.
- `envFilesAgree`: a run in which no mode's env files were present is `cannot-tell`. It was `ok: true` beside a note reading SKIPPED, counted as a pass — the opposite of what the package's own skill promised.
- Every module check's `title` is optional in its types, as the engine already defaulted it.
