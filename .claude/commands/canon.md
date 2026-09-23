---
description: Read or amend the canon — a SKILL.md, and the gate that enforces it.
argument-hint: '[the rule, or the area]'
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

Canon work for **specwarden**: `$ARGUMENTS`

The canon is `skills/<rule>/SKILL.md`; its executable half is a check under
`.specwarden/checks/repository/`, whose logic lives in `scripts/` with a spec beside it — or
an entry in `.specwarden/rules.mjs` that says why nothing can enforce it. Neither half is
complete alone.

## Reading

Start at `skills/README.md`, then the one skill that owns the area. Do not read all of them
— one owner per rule is the point, and a second partial copy is how a reader stops early and
invents the rest. If two skills say the same thing, that is a defect: report it.

## Amending

A rule is written down when it has been LEARNED — a defect it would have prevented, a
decision re-litigated twice. Not when it merely sounds sensible.

1. **State it in one sentence**, in the imperative.
2. **Carry the defect with it** — what went wrong without it, concretely, with the number
   if there was one.
3. **Give it exactly one owner.** If it fits two skills, the more specific one owns it and
   the other points.
4. **Make it fail.** A rule nothing checks diverges from the code silently. Follow
   `skills/gates/SKILL.md`: pure logic in `scripts/`, a check wrapping it, the rule declared
   on the check, and the declaration that stops it going silent.
5. **Show it red.** Break something on purpose, watch the gate fail with its message,
   restore.
6. **Pin it** — `scripts/<name>.test.mjs`, including the case the gate exists to catch.

## Then

```bash
pnpm check:router:write     # after any AGENTS.md edit
pnpm format && pnpm scaffold   # llms.txt lists every skill
pnpm gate:fast
```

If the new rule makes existing code fail, fix the code — or say plainly that the rule is
aspirational, and scope it in writing to where it holds today.
