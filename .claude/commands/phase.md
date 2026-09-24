---
description: Run one plan phase end to end — read, build, show red, test, gate, changeset, commit.
argument-hint: '<NN.M, or the phase name>'
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

Take phase `$ARGUMENTS` of the active plan in `_plans/` to green, and commit it.

This is the whole loop. Do not pause between steps for approval; report at the end.

## 1. Read

The phase, and the phases before it that it depends on. Then the `SKILL.md` that owns each
area it touches — the code says what IS, the canon says what MAY be.

## 2. Build

One change at a time, with the narrow command while working: `pnpm --filter <pkg> test`,
`pnpm gate --id <id>`.

## 3. Show it red

Every check the phase adds or changes is watched FAILING on the defect it exists for, with
the message it was written to print, before it is believed. Then passing.

## 4. Pin

Every invariant the phase introduces gets a test that names the defect it prevents. A new
check factory also gets its package playground scene, and a defect in every template
playground that writes it — the template proofs refuse it otherwise.

## 5. Prove

```bash
pnpm build
pnpm gate
```

Green on both tiers, or the phase is not done. A package below its coverage ratchet gets
the missing test — never a lower threshold. A check that fails is fixed in the code, not in
the check, unless the check itself is the bug — then say so and pin the case it got wrong.

## 6. Changeset and commit

A change a consumer would notice — a name, an option, a default, a verdict, what a template
writes — gets `pnpm changeset`, written for whoever installs it. `skills/commits/SKILL.md`
owns the message. One phase, one commit.

## Report

What landed, what each test pins, which playground ids moved, and anything the phase called
for that you deliberately did NOT do — with the reason. A phase that ends red is two phases;
say which half is finished.
