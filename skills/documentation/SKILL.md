---
name: documentation
description: Comments, READMEs, guides and package docs — what each carries, and what it must not.
---

# documentation

## 1. One fact, one owner

A partial second copy is worse than no copy: it makes a reader stop early and invent the
rest. When two documents could carry a fact, the more specific one owns it and the other
points.

## 2. What each document is for

| Document                 | Answers                                                 | Reader                                   |
| ------------------------ | ------------------------------------------------------- | ---------------------------------------- |
| root `README.md`         | what this fixes, and which package does what            | somebody deciding whether to use it      |
| `ARCHITECTURE.md`        | how the packages divide the work                        | somebody deciding where to put something |
| `CONTRIBUTING.md`        | how to run the repository, and how a release is cut     | a contributor                            |
| `AGENTS.md`              | where every rule lives — it routes, it does not restate | a contributor or an agent, first         |
| `llms.txt`               | every document, at a stable address                     | a model that was handed the repository   |
| `<pkg>/README.md`        | what this package is — **generated**                    | somebody on npm                          |
| `<pkg>/GUIDE.md`         | how to use it, end to end                               | somebody who installed it                |
| `<pkg>/SKILL.md`         | what may not change here, and why                       | whoever maintains it                     |
| `skills/<rule>/SKILL.md` | how to write the thing being added right now            | a contributor or an agent                |
| a docblock               | why this code is shaped this way                        | whoever edits it next                    |

## 3. A comment carries the WHY

Reading code answers questions about mechanics most of the time and about intent almost
never; documentation is the reverse. A comment restating what the line does buys the
weaker number and rots.

What earns a docblock: **the defect that produced the rule, with its measurement.** "It
said `node20` while the source imported `fs.globSync`, so every run on a node-20 shell
died with a bare export error rather than a version complaint" is worth its lines.
"Sets the build target" is not.

## 4. Do not restate a count the repository owns

"eighteen packages" in prose goes stale the day a package is added, silently. Derive it,
or name the source. A number in a document is a claim nothing checks.

## 5. A generated document says so

Every generated file carries the line naming its source and the command that rewrites it.
Without it the first reader edits the copy, and the edit vanishes at the next
regeneration with nothing to explain where it went.

## 6. English, and the same voice everywhere

Published documentation is English. Not a style preference: these packages are consumed
by strangers, and a document half its readers cannot read is a document that does not
exist for them.
