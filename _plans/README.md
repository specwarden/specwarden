# \_plans

Working documents for work that is not done yet — and nothing else. This folder is empty
whenever no work is in flight, which is its normal state; a plan is deleted, not archived,
when its work lands and its facts have been harvested into the documents that own them.

`skills/plans/SKILL.md` owns the shape; `pnpm gate --id plans --id plan-staleness --id
plan-decisions` holds every file here to it. In short: `NN-<slug>.md`, flat, numbers never
reused; a `**Status:**` and, once active, a `**Branch:**` that resolves; a runnable
acceptance command under every `## Phase`, naming only gates that exist; no sizing; every
rejected alternative with its reason.
