---
'specwarden': minor
---

**Behaviour change, a fix:** a check declaring `direction: 'up'` is held to it by `verdictFrom`, `fromResult` and every primitive — a count below an `up` threshold now fails. The direction was read by `defineCheck` alone, so an `up` ratchet on any other factory passed a score that fell.

- A ratchet is one input: `ratchet: 3`, or `ratchet: { id, direction, ceiling }`. `ratchetId` and `ratchetDirection` are gone (`IRatchetDeclaration`, `TRatchetInput`, `ratchetDeclaration`).
- The stored threshold a check receives is `ctx.threshold` (was `ctx.ratchet`), and `testContext`/`runCheck` take it as `threshold`. `thresholdOf(ctx, check)` is the one reading of it — the stored value, else the declared ceiling, else 0, with the declared direction — and what `verdictFrom(findings, thresholdOf(ctx, self))` takes.
- A verdict states its measurement as `verdict.measured` (was `verdict.ratchet.value`).
- `commandCheck` refuses `ratchet` at load, exit 2: it has no count to tolerate, and the option was accepted and dropped.
