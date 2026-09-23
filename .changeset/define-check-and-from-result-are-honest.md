---
'specwarden': minor
---

`defineCheck`: a declared `corpus` whose body reports no `examined` count now fails, naming the missing count — it had no floor at all and passed over zero files. A finding with no `severity`, or one outside `error`/`warning`/`info`, counts as an error; it was printed and ignored by the verdict. A body that returns nothing fails in words about the body instead of "reading 'unit'".

`fromResult` takes `examined`, `unit` and `corpus` as `defineCheck` does, and refuses a result it cannot read — a bare array, a key it does not know (`problems`), or nothing — where it printed `✓ clean` over the problems it was handed. Its pass line is now `✓ <id> — clean` (or `— N <unit> examined, clean`), the frame every primitive uses; it was `✓ <id> clean`.

These are fixes: a check that turns red was reporting success over nothing, or over findings it dropped.
