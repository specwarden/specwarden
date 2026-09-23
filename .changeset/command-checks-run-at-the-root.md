---
'specwarden': patch
---

**Behaviour change, a fix:** in a monorepo, a `commandCheck` run from a package directory now runs at the repository root, where its `paths` were always verified. A command that relied on the invoking directory names it in `cmd` — `cd packages/api && …`.

A command check runs at the repository root, wherever the CLI was invoked from. Run from `src/`, it ran there, while its `paths` were verified against the root — one directory checked, another used. `ChildProcessRunner` takes the directory a command runs in when its caller names none.
