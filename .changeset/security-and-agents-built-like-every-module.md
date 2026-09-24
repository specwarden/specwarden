---
'@specwarden/security': minor
'@specwarden/agents': minor
---

Verdict change: `agentDefinitions` fails an agents folder that holds no definition (it passed, "nothing to verify"), through the engine's corpus floor, and honours `ratchet` (it accepted it and dropped it). A folder made before its first role declares `corpus: { atLeast: 0 }`.

Both factories take `IModuleCheckDeclaration`: the id defaults to `secret-scan` / `agent-definitions`, `zone` is refused, and every refusal of an empty corpus is the engine's (`examined 0 file(s) — … below the floor of 1.`), with the engine's pass line on a clean run.

- `secretScan`: `scan` → `files` (a pathspec or a list); `skipPaths` and `skipExtensions` → one `except` of pathspecs, ADDED to the exported `DEFAULT_SECRET_EXCEPT` (lockfiles, build output, binary and media files) rather than replacing it — replacing one list to add a folder dropped every lockfile from the defaults. The `ratchet?: number` option duplicated the identity's and is gone; `corpus` is new.
- `agentDefinitions`: an empty `agentsDir`, `required` or `spawnTools` is refused at load (`orchestrators: []` still forbids delegation); every finding carries the line of the field it is about, and the messages say what to do.
