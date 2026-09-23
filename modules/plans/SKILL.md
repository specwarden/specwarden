---
name: maintaining-plans
description: What may not change in @specwarden/plans, and why — read before editing a check in this package.
---

# Maintaining `@specwarden/plans`

The MAINTAINER's document. Using the package is [GUIDE.md](./GUIDE.md); reasoning about
it inside somebody else's repository is
[skills/specwarden-plans/SKILL.md](./skills/specwarden-plans/SKILL.md).

## The one thing that makes this module optional

It encodes a **way of working**. That is why it is not in the engine, and it is also the
line to hold in review: a rule that would be true of any repository belongs in the
engine, and a rule that assumes this lifecycle belongs here with its assumption stated.

## Invariants

1. **"Cannot tell" never becomes "spent".** A checkout with no branch refs SKIPS. The
   staleness check routes this through the engine's own `computeLifecycle` rather than
   deciding it locally, so the fail-safe direction cannot be lost by a local edit. An
   archived plan whose work is under way is worse than every defect this module finds.

2. **Defaults exist for the five declaration options.** Before them, every scaffold
   either shipped the check unconfigured — and it threw on the first repository that had
   a plan — or shipped it as an example nobody filled in. Both end with the check not
   running. Do not remove a default to "make the consumer decide".

3. **An unknown `--id` is a HARD failure, with no declaration mechanism.** A plan whose
   phase delivers a new gate routes its acceptance through the script path until the gate
   lands. Adding an escape hatch here is a real proposal with a real cost — weigh it, do
   not slip it in.

4. **`knownGateIds` defaults to the roster, not to a list.** The moment a consumer keeps
   the list by hand, the audit that exists to catch an omission omits silently.

5. **Plans are flat.** A directory inside `plansDir` is an error, because a nested plans
   folder is how plans stop being deleted. The archive therefore lives outside it.

## Changing a check

- The fixture is [`_playground/repository.ts`](./_playground/repository.ts) — `CLEAN` and
  `BROKEN`, one defect per rule, each commented.
- `planStaleness` reads `ctx.vcs.branchNames()`, which returns `undefined` for "cannot
  tell". A test that passes a list is not testing the branch this invariant protects; the
  playground passes `branches: null` for that.
- Run `pnpm --filter @specwarden/plans test`.

## What belongs somewhere else

- The **grammar** of a decision log is the engine's (`parseDecisionLog`,
  `rejectionsWithoutReason`): it is a form, not a way of working, and a second parser
  would be a second definition of what a rejection is.
- Requirements read from a spec tool are `@specwarden/openspec` or
  `@specwarden/speckit` — a plan is work in flight, a requirement is a decided thing.
