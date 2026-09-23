---
'@specwarden/plans': patch
---

`planShape` no longer throws on a `phaseHeadingRe` without a capturing group. It read each phase heading's depth from the regex's first capture group, and the regex `specwarden init --template agentic` writes — `/^##+\s+(?:Phase|Stage)\b/im` — captures nothing, so the check crashed on the first plan with a phase in it. The depth is now read from the heading's own `#`s, whatever the regex looks like.
