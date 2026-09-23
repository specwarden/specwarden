---
'@specwarden/security': minor
---

`secretScan` refuses an unknown key under `patterns` by name — only `extra`, `disable` and `replace` exist. The GUIDE said `patterns.add`, which nothing read: the pattern it carried was never scanned for, and a planted key of exactly that shape stayed green. An allowlist entry now takes `why` beside `file` and `patternId`, and an entry with any other key, or without a string `file` and `patternId`, is refused when the file loads.
