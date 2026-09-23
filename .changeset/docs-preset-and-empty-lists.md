---
'@specwarden/docs': minor
---

`docsChecks({ code, suffixes, countableNouns, placement })` returns all five documentation checks with their conventional ids (`doc-paths`, `doc-symbols`, `doc-counts`, `doc-placement`, `doc-hygiene`) over one corpus — the whole module in eight lines instead of thirty-one. Each check still takes its own options (`paths`, `symbols`, `counts`, `placement`, `hygiene`), laid over the preset's, or `false` to leave it out; a missing fact is refused by name rather than the check being dropped.

`docs` is now optional on every check and defaults to `**/*.md`, every tracked document. `docCounts` needs only `countableNouns`: `skipped`, `allowlist` and `when` default to none — it died with "options.allowlist is not a function" without them — and it takes `docs` like the other four.

Two verdict changes. `docCounts` over no document at all now FAILS naming the pathspec, like the other four; it passed as "✓ 0 document(s)". And an empty `countableNouns` or `suffixes` is refused when the file loads: an empty list matched every number, or every backticked PascalCase name, rather than nothing. If a scaffolded `.example` stops loading, fill in the list it asks for.
