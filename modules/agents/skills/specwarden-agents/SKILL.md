---
name: specwarden-agents
description: Use when a repository has coding-agent role definitions that must stay valid — every agent declaring its name, description, tools and model, with its name matching its file, and only an orchestrator able to spawn.
---

# specwarden-agents

`@specwarden/agents`

## When to reach for it

A repository with a roster of agent roles — `.claude/agents/*.md` or its equivalent. It
catches the defects that are invisible at the file:

- **A name that does not match its file.** An assistant addresses an agent by the name in
  its frontmatter and a person addresses it by the filename; when the two differ, one of
  them is talking to nothing.
- **A missing description.** The description is what decides whether an agent is selected
  at all. Absent, the role exists and is never chosen — which reads exactly like a role
  nobody needed.
- **A missing `tools:`**, which inherits the whole session toolset rather than none.
- **A non-orchestrator that can spawn agents** — an unbounded fan-out nobody planned and
  nobody sees until the bill.

## The wiring

```js
import { agentDefinitions } from '@specwarden/agents';

export const check = agentDefinitions({ orchestrators: ['lead'] });
```

`agentsDir` is a FOLDER, not a glob, and defaults to `.claude/agents`; `orchestrators`
defaults to `['lead']`; the id is `agent-definitions` and the rule is the package's own.
There is no universal answer to which roles may delegate — naming them is the decision the
check exists to make visible, and `orchestrators: []` forbids delegation entirely, which is
a legitimate and much simpler rule of your own.

## What it refuses

At load, by name: an option the factory does not have (`agents:` for `agentsDir`), an empty
`agentsDir`, `required` or `spawnTools`, and `zone`. At run time: a roster that is not where
`agentsDir` says — absent, a file, or a folder with no definition — fails rather than
passing as "nothing to verify". Point `agentsDir` at the real roster rather than removing
the check.

## Refuse to

- let a role exist without a description, on the grounds that "everyone knows what it
  does" — the reader is a model choosing between fifteen of them;
- widen the orchestrator list to silence a finding. If a role should delegate, that is a
  decision worth making on purpose;
- declare `corpus: { atLeast: 0 }` over a roster that moved.
