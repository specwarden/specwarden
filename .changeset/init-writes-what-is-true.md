---
'specwarden': minor
---

`specwarden init` writes a shorter tree that says only what is true of it, and ends with the steps it left undone.

- A generated live check states its own rule (`rule: '…'`, owned by the check file) and names no `id`, `title` or default `tier` — the file name, the rule and the engine supply them. An `.example` names its `id`, the one its commented rule names. `rules.mjs` holds only the rules no single check states; a template rule left without an owner is owned by the file that holds its reasoning (the check, or `perimeter.mjs`), not by `.specwarden/README.md`, which never mentioned it.
- An `.example`'s rule is written into `rules.mjs` commented out, owned by the file the example becomes, so switching one on is "rename it AND uncomment its rule" — and the console says so, per example. An example built on `fromResult`, which implies no rule, is red on `orphan-check` until the rule is uncommented; one built on a module check runs on the module's implied rule meanwhile.
- `.specwarden/README.md` lists the files that were written — `perimeter.mjs` or `spec-source.mjs` only where there is one, no `relevance.mjs`, `ratchets/` or `baseline/` — and no longer claims a zone check the tree does not run. `checks/README.md` lists each family folder written, its checks (examples marked off) and the package they come from; its "Adding a check" example carries `rule`.
- The console lists `perimeter.mjs` and `spec-source.mjs` at their real paths, beside `checks/` rather than under it; `Detected:` counts the workspace PACKAGES the globs match (it said "1 workspace(s)" for one glob over three packages), names an unrecognised test runner by its script instead of `other`, and names the workflow and proxy config it found. `Next:` names the perimeter hook to wire, and recommends `suggest` only without a template.
- A template's context gains `workflows`, `proxyConfigs` and `envSamples` — what `init` found — so an example points at the repository's own files.

`specwarden adopt` and `specwarden suggest` no longer say to copy anything into `warden.config.mjs`. `suggest` prints the whole check file — import, ratchet at today's exceptions, rule — and the path under `.specwarden/checks/` to save it at; saved as printed, it loads and holds.

Nothing already scaffolded changes. The templates of this release rely on the commented-rule behaviour: with an older engine an example's rule would be written live and fail `enforcement-resolves`, so upgrade `specwarden` with them.

`ITemplateContext` gains `workflows`, `proxyConfigs` and `envSamples`, optional: what `init` detected, so an example names a path the repository has.
