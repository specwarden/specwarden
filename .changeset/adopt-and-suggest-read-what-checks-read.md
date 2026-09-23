---
'specwarden': minor
---

- `adopt`, `suggest` and `init` read tracked files inside a git work tree, and the disk — without `node_modules/`, `dist/`, `build/` or `coverage/` — outside one. They globbed the disk, so an installed package's services counted as the repository's convention and a `.sh` in `node_modules/` meant "this repository has shell scripts"; outside a work tree `ls-files` answered nothing and a directory full of files read as empty.
- `adopt` names `node --test` as `node:test` and mocha as `mocha` (`TTestRunner` gains both), and reports every fact `init` acts on: the CI workflows, the documents, the spec framework, compose files, proxy configs and shell scripts, and how many packages the workspace globs match.
- `suggest` knows a plain repository's habit — every `src/**/*.{ts,tsx,js,mjs}` beside its `.test` or `.spec` file, the tests, `index` files and declarations excepted — and proposes the spelling the repository uses. A narrower habit a broader proposal already holds is not proposed twice. It proposes nothing from fewer than three files, and names a habit followed between 70% and 90% as a near miss, with what is missing.
- `siblingRequired({ except })`: pathspecs among the subjects that need no sibling.
- With no module installed, the checks README `init` writes names each module, its install line in the repository's package manager, and the whole check file to save. It named factories the engine does not have, and `init` said the README listed what to add.
- For code that uses the exported names: `detectRepo` answers `'mocha'` or `'node:test'` where it answered `'other'`, and `undefined` where a `"test":` key appeared outside `scripts`; an exhaustive `switch` over `TTestRunner` gains two cases. `inferSibling` takes an `IInferSiblingOptions` (`except`, `list`), its default listing leaves installed and built trees out, and `ISiblingInference` gains `subjects` and `except` — a hand-built one needs them.
