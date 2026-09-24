---
name: plans
description: Where a working document for unfinished work lives, the shape the plans checks hold it to, and when it dies.
---

# plans

A plan is the working document for a piece of work that is not done yet. This repository
publishes `@specwarden/plans` — the module that checks exactly this — and checks its own
plans with it, so everything below is enforced rather than hoped.

## 1. A plan is ephemeral

It is **deleted** when the work lands. A finished plan left in a live corpus asserts a false
present tense — it describes an intended future in the present, which a reader, and an
agent, cannot tell from a description of now. That is the whole reason plans are kept apart
from documentation, and why nothing is archived here: there is no `_plans/_archive/`.

`_plans/` is empty whenever no work is in flight, and that is its normal state.

## 2. A plan is never the source of truth about current behaviour

File and symbol names that do not exist yet are legal in a plan and nowhere else. So
**nothing outside a plan links into one** — a README, a skill or a docblock pointing at a
plan is a dangling pointer with a delayed fuse.

## 3. The shape the checks hold it to

`pnpm gate --id plans --id plan-staleness --id plan-decisions`:

| Rule                                                                        | Why                                                                                             |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `_plans/NN-<slug>.md`, flat; a number is never reused                       | a plan nobody can find by name is a plan nobody deletes; a folder inside means deletion stopped |
| `**Status:** draft \| active \| done`, and `**Branch:** <name>` once active | an active plan whose branch is gone is work that landed unharvested                             |
| every `## Phase …` ends with a runnable command                             | "phase 2 is done" is otherwise an opinion                                                       |
| a `--id` in that command names a check that exists                          | the roster is read from the run itself, so a renamed check fails the plan, not the acceptance   |
| nothing sizes work — no hours, days or points                               | a size turns a work order into a bid, and the bid is what people then argue about               |
| a rejected alternative carries its reason                                   | the reason is the one fact in a decision log that exists nowhere else                           |

Phases express **dependency and deployability**, never how much fits in a sitting. Every
phase ends with `pnpm gate` green; a phase that leaves it red is two phases.

## 4. Harvest before deleting

A finished plan almost always carries facts that live nowhere else: a prohibition, a
rejected alternative, the reason for the chosen shape, a measurement. Each moves to the
document that owns its subject — a rule into a `SKILL.md`, a reason into the docblock beside
the decision, a consumer-facing change into its changeset — and only then does the plan go.
An unharvested plan deleted is a lost thought.

Every plan therefore ends with a **harvest list**: each fact, and the permanent document that
takes it. The `planner` role writes plans; it never deletes one — harvesting is checked by
whoever lands the work.
