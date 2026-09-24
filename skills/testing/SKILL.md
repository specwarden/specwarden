---
name: testing
description: What each kind of test answers, where it lives, what it must assert to be worth running, and how coverage is ratcheted.
---

# testing

## 1. Seven kinds, seven questions

| Kind                | Where                                   | Answers                                                           |
| ------------------- | --------------------------------------- | ----------------------------------------------------------------- |
| unit                | `<unit>.<role>.spec.ts` beside the unit | does this unit behave as described                                |
| contract            | `core/src/infrastructure/_contract/`    | does a real adapter answer exactly as its fake does               |
| package playground  | `<pkg>/_playground/playground.spec.ts`  | does the package work imported BY NAME, as a consumer wires it    |
| template playground | `templates/<name>/_playground/`         | is `init` green over a real repository, and can each check go red |
| root playground     | `_playgrounds/`                         | do all the packages compose — in-process and through the CLI      |
| script spec         | `scripts/<script>.test.mjs`             | does this repository's own guard still fail on what it exists for |
| runtime             | `core/_playground/runtime.test.mjs`     | does the published build work on the oldest Node it declares      |

Each answers something the others cannot; `skills/playgrounds/SKILL.md` owns the three
playgrounds.

The runtime kind exists because vitest needs Node 20 and the engine declares 18.18: nothing
else runs the published `dist` on the floor. It is build-free ESM for `node --test`,
importing `specwarden` by name, and CI runs it once per supported Node line.

`pnpm -r` never reaches the script specs — they are not a workspace package — so
the `scripts-unit` check runs the root `vitest.config.mjs`, whose `include` is PINNED to
`scripts/**/*.test.mjs`. It was not pinned once: with no config, the root run collected
every package's specs, 892 tests, and not one script had a test.

## 2. A test asserts the FAILING case

A test that only proves a check passes on good input proves nothing about whether it can
fail. Write the failing case first — a tree, a fixture, a payload that violates the rule —
and watch the check reject it. **A check nobody has seen fail is a hope.**

And assert EXACTLY what failed: `expect(failed).toEqual([id])`, never `toContain`. A defect
that lights up a neighbour's check too is either a sloppy fixture or two checks that
overlap, and both are findings `toContain` hides.

## 3. Use the engine's testing kit

```ts
import { errorsOf, runCheck, testContext } from 'specwarden';

const verdict = await runCheck(check, { tree: { 'docs/a.md': '…' } });
expect(errorsOf(verdict)).toEqual([…]);
```

A hand-built `{ files: { tryRead } }` literal works only while the body touches exactly the
method the literal defines. `runCheck` also **awaits** — `check.run(ctx)` on an async check
returns a promise whose `ok` is `undefined`, which is falsy, so an assertion that the check
failed passes against a check that never ran.

An unconfigured port throws by name, saying which option supplies it: a fake that quietly
answers "no files" turns a test of a check into a test of an empty repository.

**The kit reads a pathspec the way git does.** `trackedFiles` in the kit and in `GitVcs`
share one reading — git's `:(glob)` magic, in `git-pathspec.util.ts`: `**` spans zero or
more directories, `*` stays inside one, wildcards match dotfiles, a literal names a file or
a whole directory, an empty pathspec is everything. An explicit `tracked` list is filtered
by it too. The two used to disagree — the adapter passed pathspecs to git as written, where
`**/*.md` skips every root document — so every documentation check was unit-tested over a
`README.md` its real run never read. `core/src/infrastructure/_contract/vcs.contract.spec.ts` now holds both sides
to the same cases.

## 3a. A glob is held to a recording, never to the runtime

`glob` — both file sources — answers what `core/src/infrastructure/_contract/glob/glob.golden.json`
recorded Node 24.21's own `fs.globSync` answering, pattern by pattern, per platform. Not to
the live runtime: Node 18 and 20 have no `globSync`; 22.x, 24.0–24.20, 25.x and 26.0–26.7
skip sibling entries on an early return; 22.0–22.22.0, 24.0–24.13.0 and 25.0–25.3 skip a
dot directory after `**` — the maintainer's own 24.9 among them; and 26.9 stopped following
a directory link a segment after `**` names. A live comparison measures whichever of those
the machine runs.

A fuzz against native is only as good as its tree. The first one here held a single
junction whose relative target pointed one directory too high — a relative target is
resolved from the link's own directory — so it dangled, and "0 differences on 26.10" never
touched a working link; 26.9 had changed exactly what a link does under `**`. Check that a
link resolves before believing a run over it.

- The trees and patterns are edited in the JSON; every `recorded` block is written by
  `node scripts/record-glob-golden.mjs`, which refuses any Node but the one the file names,
  and refuses to write a shared section that two platforms answered differently.
- Record on each platform the set covers (win32 and linux today). A directory nobody may
  read is only recorded as a non-root user.
- A new glob construct is a new pattern in the JSON, recorded — not a hand-written
  expectation. Against the adapters this replaced, the set was red on 89 cases: 15 on the
  disk (Node 24.9's own glob) and 74 in the kit's fake.

## 4. Coverage is a ratchet, and the `unit` check turns it

Each package's thresholds live in its entry in `scripts/registry.mjs` (`coverage`), and the
generated `vitest.config.ts` enforces them. The `unit` check runs `test:coverage`, never bare
`test` — a threshold nothing turns is a number in a file. That was the state before: the
script existed in every manifest and could not start, because nothing installed the
provider.

A threshold is the measurement minus one point, floored, and carries the date it was
measured. It only rises. **Add the missing test; never lower the bar** — a green check that
got greener by moving its own bar is the failure this product is named after. The point of
slack is deliberate: two runs of an unchanged suite differ in the hundredths on the async
paths, and a threshold nailed to the best observation fails on a coin toss.

## 5. Mutation testing, for the engine only

A unit test proves a check passes on good input; a mutant proves its test would _notice_ the
check breaking. It runs on `core/` — the product-zone checks and the primitives — because
their behaviour is public API. The score is a ratchet (`break` in `core/stryker.config.mjs`)
that only rises.

## 6. Planting a defect

In a playground, a defect is an edit to a real file. Plant it with `planted(text, from, to)`
from `scripts/playground-proof.mjs`, which throws when `from` is absent — a bare `.replace`
over a phrase that is not there returns the file unchanged, the check stays green, and the
scene reads as "the check missed it". It happened on the second playground written: a
typographic apostrophe in the spec, an ASCII one in the file.

Change only what the check is about, and plant it where the check looks.

## 7. Suites run one at a time

`pnpm -r` runs four packages at once by default and each vitest already fans out across
every core. Two heavy suites at once is how a run dies with a terminated worker rather than
an assertion. `--workspace-concurrency=1` is what makes the sentence true.

## 8. Size

A spec over ~300 lines is two subjects sharing a file. Split by concern —
`check-runner.service.selection.spec.ts`, `….policy.spec.ts` — never by "part 2".
