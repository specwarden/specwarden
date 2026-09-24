# skills — the repository's canon

Rules that hold across the whole repository and belong to no single package. Each lives
in its own folder as `SKILL.md`.

| Rule                                         | Covers                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| [`structure/`](./structure/SKILL.md)         | Which package a thing belongs in, which folder, which file             |
| [`checks/`](./checks/SKILL.md)               | How a check is written, and the declarations that stop it going silent |
| [`testing/`](./testing/SKILL.md)             | The six kinds of test, what each must assert, and the coverage ratchet |
| [`documentation/`](./documentation/SKILL.md) | Comments, READMEs, guides: what each carries and what it must not      |
| [`gates/`](./gates/SKILL.md)                 | How this repository checks itself, and what makes a check worth running |
| [`publishing/`](./publishing/SKILL.md)       | Versions, changesets, what ships in a tarball, how a release is cut    |
| [`skills/`](./skills/SKILL.md)               | The three things called a skill here, and which one ships              |
| [`playgrounds/`](./playgrounds/SKILL.md)     | One playground per package and template, one at the root, and why      |
| [`plans/`](./plans/SKILL.md)                 | Where unfinished work is written down, its shape, and when it dies     |
| [`typescript/`](./typescript/SKILL.md)       | The language settings in force, and what each one forbids              |
| [`commits/`](./commits/SKILL.md)             | What the log has to carry that the diff cannot                         |
| [`vocabulary/`](./vocabulary/SKILL.md)       | One name per concept: the glossary is the contract, names inherit it   |

## Versus a package README

A package README answers _what is this and why is it shaped this way_, for somebody
deciding whether to install it. A skill here answers _how do I write the thing I am adding
right now_, identically for every contributor and every agent.

## Versus a shipped skill

These are never published. What ships is `<pkg>/skills/<name>/SKILL.md` — how an agent
uses the package in **somebody else's** repository. `skills/skills/SKILL.md` owns that
distinction, because collapsing the two produces a document that is wrong for one of its
two readers.
