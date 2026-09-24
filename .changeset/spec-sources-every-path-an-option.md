---
'@specwarden/openspec': minor
'@specwarden/speckit': minor
---

Every path is an option, as both sources said, and so is the requirement grammar. Nothing was released, so the old names are refused rather than kept:

- `openspec`: `root` → `specsDir` (default `openspec/specs`) and `changesDir` (default `openspec/changes`); new `tasksFile` (default `tasks.md`) — `specs/`, `changes/` and `tasks.md` were written into the code; `requirementHeading` → `requirementPattern`. `DEFAULT_REQUIREMENT_PATTERN` is exported.
- `speckit`: `root` → `featuresDir` (default `specs`); new `requirementPattern`, capturing the id then the statement — a house numbering its requirements differently had none read and nothing to set. `DEFAULT_REQUIREMENT_PATTERN` is exported.
- A source is not a check: `id`, `tier`, `rule` and the rest of a check's identity are refused by name, and so is an empty path. A pattern written with `g` reads every line.
- A note for a tree that is not there names the option that moves it (`Set \`specsDir\` …`).
