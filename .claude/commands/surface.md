---
description: Add or change something a consumer depends on — an exported name, an option, a default, a CLI flag, a verdict.
argument-hint: '<the name or check, and what changes>'
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

A promise is being made or changed in **specwarden**: `$ARGUMENTS`

Everything here is consumed by other repositories. A name in a barrel is kept until a major
version, and a check's verdict is somebody's CI — so the order below is not optional, and
step 1 comes before any code.

## 1. Decide, before writing

- **Which package?** "If a check could be wrong about a repository that has never heard of
  it, it is an opinion and it ships as a module." Nothing a house could disagree with goes
  in `core/`. `skills/structure/SKILL.md` §1.
- **Is it a promise at all?** A shape still settling ships behind an option whose default is
  today's behaviour, or not at all.
- **What does it do to verdicts?** Say it out loud: which trees it will newly refuse, which
  it will stop refusing. `.changeset/README.md` decides the bump from that.

For anything non-trivial, spawn `contract-architect` with the decision before writing it.

## 2. Write it, with everything that has to move with it

- the unit spec — the refusing case first;
- the package playground scene; the playground asserts every exported factory is covered,
  by what it RETURNS, so a new one without a scene fails there;
- a defect in every template playground whose template writes the check;
- the package `GUIDE.md`, and the shipped `skills/<name>/SKILL.md` if an agent should now
  reach for it — then `pnpm format && pnpm scaffold` (the guide is copied into the skill);
- `core/src/public-surface.spec.ts` if the engine's barrel changed.

## 3. Prove it

```bash
pnpm build
pnpm gate
```

Then read the playground results for ids that moved. A verdict change you did not intend is
a finding, not noise.

## 4. The changeset

`pnpm changeset`, written for the consumer: what they will see, and what to do. A verdict
change that is a FIX says so in its first line. The commit says what was promised, so the
reason survives the person.
