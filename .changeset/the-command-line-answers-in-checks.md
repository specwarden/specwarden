---
'specwarden': minor
---

**Behaviour change:** each exit code means one thing. `1` is the answer "no" — a check failed, `doctor` found a defect, a plan is not ready: `plan archive` over an unready plan exits 1 (was 2). `2` is a line, config or file that could not be used: `new` over an existing file exits 2 (was 1).

- The output says `check(s)`, never `gate(s)`: `✅ 5 check(s) passed`, `::notice title=specwarden::2 check(s) failed: …`.
- `check <id>` runs that id, as `--id <id>` does.
- A value flag takes `--flag=value` as well as `--flag value`; a switch given a value, and an empty value, are refused.
- `--json` is `--reporter json`: either sets both, and `--json --reporter tty` is refused rather than half-honoured. Under either, stderr stays quiet — the full-run reason is the document's `fullRunReason`.
- Every JSON document carries `version` (`OUTPUT_VERSION`, 1): a run under `--reporter json`, `doctor --json`, and `check --list --json`, which is now `{ version, checks: [...] }` rather than a bare array.
- A flag another command owns is refused, naming the owner — `init --tier`, `doctor --fix` and `check --template` each ran as if the flag were absent. `plan` reads its flags through the same grammar, so `plan status p.md --verfy` is refused instead of running an unverified status, and `plan archive --verify` is refused.
- Every refusal goes to stderr as one sentence ending with a period; a near miss reads `unknown check id 'no-tod' (did you mean 'no-todo'?).`
