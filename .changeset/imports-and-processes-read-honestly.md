---
'specwarden': patch
---

`forbidImport` and the zone barrier now catch a dynamic `import('x')`. They read only static imports, so `await import('some-orm')` passed a ban on `some-orm` — this is the defect those checks exist for, and a check that newly fails on it has found a real import.

A command check that runs past its `timeoutSec` is now reported as killed by the timeout, not as a shell that could not start. The asynchronous process runner also closes a child's stdin when there is no input to give it (a child that read stdin used to hang until its timeout, or forever), and no longer crashes the run when a child exits without reading the input it was handed.
