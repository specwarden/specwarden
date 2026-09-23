---
'specwarden': minor
---

A command check with no `shell` of its own now runs through the shell resolved for the machine. Everywhere but Windows that is still `bash -c`. On Windows a bare `bash` is often WSL's launcher, so a command check ran inside Linux — where the Windows `node`, `pnpm` and the checkout's own tools do not exist — and failed for a reason unrelated to the repository, while the same run from Git Bash passed. The engine now looks for Git for Windows' own `bash.exe` beside the `git` on the PATH or in the usual install directories, and falls back to `bash -c` when there is none.

To choose a shell for every check, set `SPECWARDEN_SHELL` to its executable (`pwsh`, `cmd`, `C:\tools\sh.exe`); the flag is derived from its name. `regenerable` and `specwarden plan --verify` use the same resolution, and a shell that cannot start now says how to set one.
