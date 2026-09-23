---
'@specwarden/scaffold-parts': minor
---

Every part writes a check with a short header (what it catches, why in one sentence, what to change) and its options, leaning on the engine's defaults: no `id`, `title` or `tier: 'fast'`, and the rule on the check as a string. An example keeps its `id`: the rule `init` writes commented out for it names the check by that id. `IPart.rules` now holds only what the register must — a rule whose enforcers are not checks (the perimeter's) and an example's rule, which `init` writes commented out; a live part's `rules` is empty. `IPartOptions.header` is now the one sentence saying why the check earns its place, replacing the default sentence, not a whole paragraph.

The perimeter part contributes no config fragment: the engine reads `perimeter.mjs`'s rule ids as enforcers itself. `docPathsPart` takes `docs` and `skipDirs`. The CI-coverage, upstream and env-file examples read `workflows`, `proxyConfigs` and `envSamples` from the engine's `ITemplateContext` and say plainly what to replace where nothing was found. The count and symbol examples ship a guessed `countableNouns` / `suffixes` marked REPLACE — the empty lists they shipped are a load error now, and never meant "inert". New exports for a template writing its own files: `header`, `switchOn`, `exampleRule`, `literal`, `tierOption`.
