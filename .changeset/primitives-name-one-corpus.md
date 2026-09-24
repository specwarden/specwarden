---
'specwarden': minor
---

Every file-reading primitive names its corpus `files` — a pathspec, or a list whose matches are joined — and takes `except`.

- `forbidPattern.in`, `referencesResolve.in`, `forbidImport.from`, `siblingRequired.subjects` and `pathContract.kind` → `files`. `forbidPattern.allow` → `allowMatch`; `regenerable.by` → `cmd`. An old name is refused at load, naming the options the factory takes.
- `referencesResolve`, `mustDeclare` and `pathContract` gain `except`; they had none, so a file could only be left out by rewriting the pathspec around it.
- `files: []` is refused at load — a scan of nothing reports success. `checkOptions` gains `nonEmpty` for this, `{ refused: 'why' }` for an identity field a factory cannot honour, and `{ identity: false }` for a factory that builds no check.
- One exported `ICorpusFloor` — `corpus: { atLeast, why }` on `defineCheck` and `fromResult` too, where `atLeast` defaults to 1.
- `IModuleCheckDeclaration` (`Omit<ICheckDeclaration, 'zone'>`) is what a module's factory takes.
