---
'specwarden': minor
---

- `commandCheck({ cwd })` runs the command in a directory relative to the repository root — `cwd: 'packages/api'` for a package's own suite in a monorepo. The directory is verified before the command spawns, as `paths` are; a missing one fails the check naming it, and the command is not run.
- **Behaviour change, a fix:** a wrapped command's colour codes are stripped from its output before `expect` and `refuse` read it and before it becomes a finding. Under `FORCE_COLOR` they passed verbatim into findings and JSON, and an `expect` written against the words failed on the escapes between them.
- `cwd` is a directory inside the repository, relative to its root: an absolute path or one with `..` is refused when the check file loads, exit 2. `paths` stay relative to the root whatever `cwd` says.
- Colour stripping cuts both ways: a `refuse` pattern that escape codes used to break up (`\e[1m0\e[22m tests`) now matches, so a check that passed over a tool's "0 tests" goes red — the silent run it was written against.
