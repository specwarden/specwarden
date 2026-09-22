---
name: testing
description: What each kind of test answers, and what a test must assert to be worth running.
---

# testing

## 1. Three kinds, three questions

| Kind       | Where                    | Answers                                            |
| ---------- | ------------------------ | -------------------------------------------------- |
| unit       | `<pkg>/src/**/*.spec.ts` | does this unit behave as described                 |
| script     | `scripts/*.test.mjs`     | does this repository's own guard behave            |
| playground | `_playgrounds/`          | does a template produce a repository that is green |

`pnpm -r` never reaches the scripts — they are not workspace packages — which is exactly
how a guard ends up being the only untested code in a repository about testing.

## 2. A test asserts the FAILING case

A test that only proves a check passes on good input proves nothing about whether it can
fail. Write the failing case first: a tree, a fixture, a payload that violates the rule,
and watch the check reject it. **A check nobody has seen fail is a hope.**

## 3. Use the engine's testing kit

```ts
import { errorsOf, runCheck, testContext } from 'specwarden';

const verdict = await runCheck(check, { tree: { 'docs/a.md': '…' }, tracked: ['docs/a.md'] });
expect(errorsOf(verdict)).toEqual([…]);
```

A hand-built `{ files: { tryRead } }` literal works only while the body touches exactly
the method the literal defines, and fails with an unreadable type error the moment it
reaches a second port. `runCheck` also **awaits** — a check may be async, and
`check.run(ctx)` without an await returns a promise whose `ok` is `undefined`, which is
falsy, so an assertion that the check failed passes against a check that never ran.

An unconfigured port throws by name, saying which option supplies it. That is deliberate:
a fake that quietly answers "no files" turns a test of a check into a test of an empty
repository.

## 4. Coverage is a ratchet, never a target

A threshold is set to the measurement, minus a point of slack, and only ever rises. The
rule is to add the missing test, never to lower the bar — a green check that got greener
by moving its own bar is the failure this whole product is named after.

The point of slack is deliberate: two runs of an unchanged suite differ in the hundredths
on the async paths, and a threshold nailed to the best observation fails on a coin toss.
A check that cries wolf stops being read.

## 5. Mutation testing, for the engine only

A unit test proves a check passes on good input; a mutant proves its test would _notice_
the check breaking. It runs on `core/` and nowhere else, because a product-zone check's
behaviour is public API and the cost of an unnoticed break is highest there.

The score is a ratchet that only rises.

## 6. Suites run one at a time

`pnpm -r` runs four packages at once by default and each vitest already fans out across
every core. Two heavy suites at once is how a run dies with a terminated worker rather
than an assertion — in a different package each time, which teaches re-running instead of
reading. `--workspace-concurrency=1` is what makes the sentence true.
