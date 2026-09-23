---
description: Verify, then write the commit — one change, with its reason, its numbers and its changeset.
argument-hint: '[what to include, if the tree holds more than one change]'
allowed-tools: Read, Grep, Glob, Bash
---

Commit the work in **specwarden**. Scope: `$ARGUMENTS`

## 1. Look at what is actually there

```bash
git status
git diff
git diff --staged
```

Two unrelated changes are two commits. Split them; do not narrate one message covering
both. A regenerated file is committed WITH the change that caused it — a regeneration
committed apart from its cause is a diff nobody can review.

## 2. Prove it before writing the message

```bash
pnpm build
pnpm gate
```

A commit that has not run the list is a claim, not a result. If something is red, fix it or
say in the message that it is red and why — never quietly.

## 3. The changeset

A change a consumer would notice — an exported name, an option, a default, a CLI flag, a
verdict, what a template writes — carries one (`pnpm changeset`), written for whoever
INSTALLS the package. The commit is for whoever reads this repository. Neither substitutes
for the other.

## 4. Write it

`skills/commits/SKILL.md` owns the message and is the only copy of those rules. What it will
hold you to:

- the subject is a claim that could be false — `<type>(<scope>): <what is now true>`;
- the body says what was wrong before, with its measurement, why THIS shape, and what was
  considered and rejected;
- what you deliberately did not do is stated, not omitted.

English, always — code, comments, docs, changesets and commit messages.

## 5. Then

Commit. Do not push unless asked. Report the subject line and the gates that were green
when it landed.
