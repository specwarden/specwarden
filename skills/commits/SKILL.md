---
name: commits
description: What the log has to carry that the diff cannot.
---

# commits

## The diff says what changed. The log says why, and what it cost.

A subject line naming the change is the cheap half. The body carries what will not be
recoverable in six months:

- **the defect that produced the rule** — measured, with the number. "Seventeen of the
  eighteen build scripts were byte-identical" is a reason; "reduce duplication" is a
  preference;
- **what was considered and rejected**, when the obvious alternative will otherwise be
  re-proposed by the next reader;
- **what is knowingly left undone**, so nobody mistakes a decision for an oversight.

## What not to write

Do not restate the diff. The list of files touched is already in the commit, and a body
that paraphrases it teaches readers to skip bodies.

Do not describe the process. "First I tried X, then Y" belongs in a plan or nowhere; the
log records the decision, not the route to it.

## Subject line

`<type>(<scope>): <what is now true>` — present tense, and a sentence a reader can
evaluate.

`feat(core): a check declares the rule it enforces` is a claim.
`feat(core): add rule field` is a changelog entry a machine could have written.

## A user-visible change carries a changeset

The commit explains it to whoever reads this repository; the changeset explains it to
whoever installs the package. They are different readers and neither substitutes for the
other — see `skills/publishing/SKILL.md`.
