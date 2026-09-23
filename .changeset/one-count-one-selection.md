---
'specwarden': minor
---

**Behaviour change, a fix:** `check --tier <t>` over a tier that holds no check, and `--tier` with an `--id` from another tier, now exit 2 where they exited 0. Both were runs over nothing (or over the wrong thing) reported as a pass — the defect this product is named for. A CI job for a tier with no check yet goes red: add the check, or remove the job until there is one.

The command line selects and counts one way everywhere.

- `--tier` with `--id` runs the named checks of that tier; an id outside it is refused, exit 2. `--tier heavy --id no-todo` ran the fast `no-todo`.
- A run over a tier that holds no check is refused, exit 2 — it passed as "0 gate(s) passed". `check --list` over such a tier still answers with nothing.
- `check --list --json` prints the roster as JSON: `id`, `title`, `tier`, `advisory`, `exclusive`.
- Both reporters count one way: a passing advisory check is passed, a failing one warned. The terminal said "4 gate(s) passed" for five; the GitHub notice counted a failed advisory check as passed. Under GitHub an advisory check's errors are annotated `::warning`, never `::error`.
- A run in which every selected check was skipped says "nothing ran", not "✅ 0 gate(s) passed".
- The JSON document carries `fullRunReason` when relevance did not filter the run. `IReporter.runFinished` receives it as an optional third argument, `IRunSummary`.
- `--fix` over a failing check that has no fix says so.
- An unknown `--id` that is a check file's name says which id the file declares.
- The loader's notes (`ℹ discovered …`) print for `doctor` and `check --list`, not on every run.
- `doctor`: a check line carries ` advisory` and ` exclusive` after its capabilities, and a sixth, tab-separated column naming the file it came from. A script reading the title as the last column reads the file now.
- `ILoadedTree` gains `origins` and `rulesDeclared`.
