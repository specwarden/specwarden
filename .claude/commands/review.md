---
description: Read-only review of finished work against the request, the canon and the checks.
argument-hint: '[what to review — defaults to the working tree and the last commit]'
allowed-tools: Read, Grep, Glob, Bash
---

Review, do not edit. Target: `$ARGUMENTS` (empty → the working tree and the last commit).

## Read

`git status`, `git diff`, `git log -1 --stat`, every pending `.changeset/*.md`, then the
`SKILL.md` that owns each changed area. If a template changed, its
`_playground/repository/.specwarden/` diff IS the review of what a consumer receives — read
it line by line.

## The six questions

1. **Was the whole request answered?** Scope quietly narrowed is the commonest defect.
2. **Does it obey the canon that owns it?** Quote the rule; do not judge by taste.
3. **Can every changed check fail?** Is there a test showing it red, and the declaration —
   `corpus`, `paths`, `expect`/`refuse` — that stops it going silent?
4. **Is anything now said twice?** A rule in a second file, a count in prose, a generated
   file edited by hand.
5. **Does every new invariant have a test that names it?**
6. **Does a user-visible change carry a changeset** with the bump `.changeset/README.md`
   calls for — including a change to a verdict?

## Run, do not assume

```bash
pnpm build && pnpm gate
```

If the caller says the checks passed, run them anyway, and read the counts.

## Report

A verdict in one sentence, then findings as `path:line` + the rule quoted + the smallest fix,
then the areas reviewed and found CLEAN. Three real findings beat ten observations, and
"ready" is a verdict you are allowed to give. For a larger change, spawn `qa`; for one that
cannot be taken back, `adversarial-reviewer` after it.
