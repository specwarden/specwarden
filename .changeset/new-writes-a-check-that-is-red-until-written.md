---
'specwarden': minor
---

`specwarden new <id>` writes `checks/[<family>/]<id>.check.mjs` and its test beside it as `<id>.check.test.mjs` — the layout the guides show; it wrote a folder per check. The scaffold is plain JavaScript (it held `as const`, and the next run died on a SyntaxError), and it FAILS until its condition is written, with a finding saying so; its generated failing-case test asserts the failure (it asserted `ok === true`).
