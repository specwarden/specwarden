---
name: maintaining-ops
description: What may not change in @specwarden/ops, and why — read before editing a check in this package.
---

# Maintaining `@specwarden/ops`

The MAINTAINER's document. Using the package is [GUIDE.md](./GUIDE.md); reasoning about
it inside somebody else's repository is
[skills/specwarden-ops/SKILL.md](./skills/specwarden-ops/SKILL.md).

## The family these five belong to

Every defect this module finds **loads cleanly and boots green**. There is no crash, no
red line, no stack trace — the config is valid and the system is wrong. That is why the
checks here can afford to be strict about "found nothing": in this family, finding
nothing is the normal way to be broken.

## Invariants

1. **"Found nothing" fails, through the engine's corpus floor.** Every check takes
   `corpus: { atLeast }` and refuses a short corpus with `belowCorpusFloor` — a compose
   file with no service, no proxy config found, a workflow with no job, no container file
   running a build, no shell script. Each was once a silent pass, or a failure in a
   sentence of its own. A clean pass prints the engine's line (`withExaminedNote`). Do
   not write a sixth refusal text.

2. **"Absent" is SKIPPED, and skipped is not a pass.** Env files are gitignored; a mode
   whose files are simply not there is reported as skipped with the reason, and a run with
   no mode compared is `cannot-tell`. Do not collapse this into either a pass or a
   failure — the first is a green nobody earned, the second makes the check unusable on an
   ordinary checkout. The env files are therefore not `env-pairing`'s corpus; the compose
   file's services are.

3. **An interpolated value is left alone.** `{$VAR}` and `${MODE}` resolve from an
   environment this package cannot see. A guess produces a finding nobody can act on,
   which is how a rule gets switched off.

4. **The parsers are line-based, and every shape that broke one has a test.** Prose that
   mentions a check id, a list wrapped over two lines, the matrix placeholder itself, a
   commented directive, a heredoc body, a nested function definition. Do not simplify a
   parser without carrying its cases — each of them, once, made a check report coverage
   it did not have.

5. **Exports are NAMED, never `export *`.** Two checks export a `violationsFor`. `export
*` makes that ambiguous — silently in an editor, then loudly at the declaration emit —
   and naming them is also how the collision gets a decision instead of a default.

6. **Every factory takes `IModuleCheckDeclaration`, goes through `buildCheck`, and checks
   its options first.** Its id defaults to the factory's name in kebab case and its rule to
   the one the package implies (`opsIdentity`); a body reads its id from `self`, never
   from the options. `checkOptions` refuses a misspelled option (`workflow` for
   `workflowFile`), an empty list (`modes: []` compared nothing and was green) and an empty
   `verifierService` at load. `zone` is refused: a module's check speaks for its module.

7. **Every check honours `ratchet`.** The verdict is `verdictFrom(findings,
thresholdOf(ctx, self))`. All five accepted `ratchet` and dropped it, so a consumer
   arming one against existing debt had every finding fail the run.

8. **The verifier rule does not depend on a mount.** A declared key a sending service's
   file sets must be non-empty in the verifier's file, whether or not any config
   interpolates it. It was found only through a mounted config, and the stack with no
   mount was green over the defect the check is named for.

9. **Patterns are RegExps.** `runnerPattern` and `buildInvocation` take a RegExp, never a
   source string; one written with `g` or `y` is read statelessly, or `.test` resumes from
   `lastIndex` and every second job reads as running no check.

## Changing a check

- The fixture is [`_playground/repository.ts`](./_playground/repository.ts): ONE
  deployment repository in two states, not one fixture per check. The five checks read
  the same repository from five angles, and a fixture per check lets those angles drift
  until the playground describes a repository nobody could have.
- The unit specs carry the parser cases; the playground carries the wiring — each factory
  clean and broken, the preset with each check red on its own defect only, an empty corpus
  for each, and the option errors. A new factory is named in `COVERED`; the engine's
  `uncoveredFactories` fails the playground when the two lists differ, and it joins
  `opsChecks`.
- Run `pnpm --filter @specwarden/ops test`.

## What belongs somewhere else

- A rule about a FRAMEWORK's layout is a plugin (`@specwarden/plugin-nestjs`), not this.
- A rule about a file's location with no stack assumption is `pathContract`, in the
  engine.
