---
name: skills
description: The three things called a skill in this repository, which one ships, and what is generated around it.
---

# skills

## 1. Three readers, three documents

| Document                       | Reader                                                       | Ships   |
| ------------------------------ | ------------------------------------------------------------ | ------- |
| `skills/<rule>/SKILL.md`       | whoever writes code **here**                                 | no      |
| `<pkg>/SKILL.md`               | whoever **maintains** that package                           | no      |
| `<pkg>/skills/<name>/SKILL.md` | an agent using the package in **somebody else's** repository | **yes** |

Collapsing any two produces a document that is wrong for one of its readers. A consumer
does not care which invariant a maintainer may not break; a maintainer does not need the
decision procedure for configuring the thing they wrote.

## 2. The shipped skill is hand-written

It is a **decision procedure** — when to reach for this, what shape to write, what to
refuse — and none of that can be derived from a document written for a person reading top
to bottom.

Its frontmatter carries `name` and `description`. The description is what decides whether
the skill is loaded at all, so it names the **situations** that should trigger it, not the
package.

## 3. What is generated around it

- `<pkg>/.claude-plugin/plugin.json` — the manifest that makes the package directory an
  installable plugin. The directory **is** the plugin: its `skills/` folder is what gets
  loaded, so one layout serves npm and the marketplace both.
- `<pkg>/skills/<name>/reference.md` — the package's `GUIDE.md`, copied in with its links
  made absolute. A copy rather than a cross-directory link, because a skill installed from
  npm has only its own folder, and one referencing a file it did not ship reads as a
  broken pointer at exactly the moment somebody needs the detail.
- `.claude-plugin/marketplace.json` — every shipped skill, listed once.

All three are written by `pnpm scaffold` and compared by `pnpm check:skills`.

## 4. One name, three places

The folder, the plugin manifest and the frontmatter must all say the same thing. When
they do not, `/plugin install` names one thing and the skill that loads announces itself
as another — and both look correct in isolation.

## 5. The skill must actually ship

`skills` in the package's `files` list. Absent, the skill exists on the repository page
and in no installed copy — which is the one reader it was written for.

## 6. Why this is gated at all

Nobody here reads the marketplace or installs a skill from it. That is precisely why both
rot: a dead entry is invisible to us and total for the agent that followed it. The reader
of these files is never the person who edits them.
