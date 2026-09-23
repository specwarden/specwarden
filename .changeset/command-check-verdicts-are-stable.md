---
'specwarden': patch
---

`commandCheck` tests `expect` and `refuse` statelessly. A `/g` pattern kept `lastIndex` between calls, so the same check run twice believed a zero exit on one run and refused it on the next. A fix: the verdict is the same on every run.
