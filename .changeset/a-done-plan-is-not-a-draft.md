---
'@specwarden/plans': patch
---

`planStaleness` reads `**Status:** done` as finished work, not as a draft: a done plan that keeps the branch its work happened on passes, with a note to harvest it and move or delete it. It failed as "a draft that declares a branch". The status words are `doneStatuses`, `['done']` by default, exported as `DEFAULT_DONE_STATUSES`.
