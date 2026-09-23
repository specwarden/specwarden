---
'specwarden': minor
---

Everything that stops the roster being assembled is now a load error — exit 2, the file named, one sentence, no stack — where several were exit 1 (the code a red gate uses) with a node stack:

- a check file that throws while it loads, and a config that does not parse or imports a package that is not installed (`<file> failed to load: …`);
- a hand-written check object with no contract version (`… is a hand-written object, not a built check`, with the fix: wrap the body in `defineCheck`);
- a `*.check.ts`, `*.check.js`, `*.check.cjs`, `*.check.mts` or `*.check.cts` under `checks/`, which was silently never loaded (the rename is printed);
- a check whose `tier` is not in the config's `tiers` — it loaded, ran under `--all`, and was skipped by every `--tier`. The message names the check, its file and the valid tiers. A repository whose `tiers` leave out `fast` gets the harness's own checks in its first tier;
- a check with no `id` that nothing could name.

A CI step that treated exit 1 as "a gate failed" now sees 2 for a broken tree instead of a false red.
