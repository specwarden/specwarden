---
'@specwarden/docs': patch
---

**Verdict change, a fix:** `docHygiene` no longer reads a link inside an inline code span. Prose explaining link syntax — `` `[done](./archive/done.md)` `` — failed on the path it quoted; fenced blocks were already skipped, and a span now is too. A real link beside a span on the same line is still read.
