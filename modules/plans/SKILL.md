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
   phase delivers a new check routes its acceptance through the command that runs it until
   the check lands. Adding an escape hatch here is a real proposal with a real cost — weigh
   it, do not slip it in.

4. **`knownCheckIds` defaults to the roster, not to a list.** The moment a consumer keeps
   the list by hand, the audit that exists to catch an omission omits silently.

5. **Plans are flat.** A directory inside `plansDir` is an error, because a nested plans
   folder is how plans stop being deleted. The archive therefore lives outside it.

6. **An absent plans folder FAILS; an empty one passes as "nothing in flight".** Three
   checks gave three answers to "the folder is not there" — a green tick, "nothing to
   verify", a failure — and the first two are a `plansDir` pointing at a folder that moved,
   reported clean forever. `_shared/plans-folder` is the one answer. The plans' corpus
   floor therefore defaults to 0 (`refusedPlans`): the folder's existence is the floor that
   cannot be lowered, and `corpus: { atLeast: 1 }` raises the rest. A pathspec corpus —
   `decisionLogShape`'s `docs`, `planStaleness`'s citation corpus while there is an archive
   to cite — refuses nothing matched, as every pathspec in the product does.

7. **One ratchet per check, and it is the engine's.** Soft findings are counted against
   `ratchet` and the stored threshold (`thresholdOf`), and the count is stated as `measured`
   (`debtVerdict`). `sizingRatchet`, `unacceptedRatchet` and `undeclaredStatusRatchet` were
   the checks' own and never saw the stored threshold; the last reported undeclared plans
   only as notes, so `--tighten` stored 0 over the plans it had been tolerating. Each
   undeclared plan is now its own finding.

8. **Every option has a default, and every factory checks its options,** refusing `zone`
   — a module's check speaks for the package. Patterns carry no `Re` suffix (`name`,
   `phaseHeading`, `command`, `sizing`) and each default is `DEFAULT_<OPTION>`, exported.
   A skill that named `plans` and `statuses` crashed the run inside a Node path call;
   `checkOptions` now refuses both by name at load, so a new option goes into the factory's
   spec in the same edit.

9. **A check's id defaults to its factory's name in kebab case, and its body reads the id
   from `self`.** A body never writes `ruleId`: `buildCheck` stamps it.

10. **`plansChecks` applies `tier` and `when` to every check, and refuses what belongs to
    one.** It accepted both and dropped them. An `id`, a `title`, a `rule` or a `ratchet`
    is refused by name; a check's own entry takes them.

## Changing a check

- The fixture is [`_playground/repository.ts`](./_playground/repository.ts) — `CLEAN` and
  `BROKEN`, one defect per rule, each commented. A new factory is named in `COVERED`; the
  playground asks the engine's `uncoveredFactories` which exported factories the claim
  misses, and fails when it names one.
- `planStaleness` reads `ctx.vcs.branchNames()`, which returns `undefined` for "cannot
  tell". A test that passes a list is not testing the branch this invariant protects; the
  playground passes `branches: null` for that.
- `except` on a folder check is read by `isExempt`: a listed plan may be untracked, so a
  literal path is compared directly and a glob is read over the tracked files.
- Run `pnpm --filter @specwarden/plans test`.

## What belongs somewhere else

- The **grammar** of a decision log is the engine's (`parseDecisionLog`,
  `rejectionsWithoutReason`): it is a form, not a way of working, and a second parser
  would be a second definition of what a rejection is.
- Requirements read from a spec tool are `@specwarden/openspec` or
  `@specwarden/speckit` — a plan is work in flight, a requirement is a decided thing.
