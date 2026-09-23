---
'specwarden': patch
---

`specwarden init` writes a `rules.mjs` that loads and is green on its first run for every template rule. A rule a template declared as not mechanizable was written with an empty enforcement and without its reason, so the fresh tree failed the rule-coverage audit, and a statement containing a backslash or a line break produced a file that did not parse. `init` also no longer crashes on a `package.json` it cannot parse; it proceeds as if no scripts were declared.
