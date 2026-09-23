---
'specwarden': minor
---

`runCheck` applies the capability gate the runner applies: a body that uses a port its check did not declare (`ctx.proc` without `exec`) fails in its test with the runner's own message, where it was green in the test and red in the CLI. A test that passed only because the gate was missing now fails — declare the capability on the check. `buildContext` no longer needs a ratchet store.
