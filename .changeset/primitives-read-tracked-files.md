---
'specwarden': minor
---

The primitives read TRACKED files (`ctx.vcs.trackedFiles`), their `except` pathspecs included, as the documentation checks already did. A working-tree glob found `node_modules/` and `dist/`, and a scratch file turned a local run red; a file that is not committed is no longer scanned, and a committed one is. A test using `runCheck` with a `tree` is unaffected — the tree is the tracked set unless `tracked` says otherwise; a hand-built context now needs a `vcs` with `trackedFiles`.

Also:

- `pathContract`, `siblingRequired` and `mustDeclare` refuse an empty corpus the way the other primitives do, take `corpus: { atLeast }` (`mustDeclare` dropped it), and print `✓ <id> — N file(s) examined, clean`. A check that goes red after upgrading is pointed at nothing: fix the pathspec, or declare `corpus: { atLeast: 0 }`.
- `sourcesAgree` and `regenerable` honour `ratchet`, and a stored ratchet, which they accepted and ignored; `regenerable` prints its examined line.
- An `except` that exempts every matched file says so, instead of blaming the glob.
- `forbidImport` with `to: '@db/'` bans everything under `@db/` — it matched nothing. A fix: a tree importing `@db/…` now fails, as it always should have.
