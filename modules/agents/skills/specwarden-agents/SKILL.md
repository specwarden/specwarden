---
name: specwarden-agents
description: Use when a repository has coding-agent role definitions that must stay valid — every agent declaring its name, description, tools and model, with its name matching its file.
---

# specwarden-agents

`@specwarden/agents`

```js
import { agentDefinitions } from '@specwarden/agents';

export const check = agentDefinitions({
  id: 'agent-definitions',
  title: 'every agent declares name, description, tools and model, and only an orchestrator spawns another',
  tier: 'fast',
  agents: '.claude/agents/*.md',
  orchestrators: ['lead'],
});
```

## What it catches, and why each matters

**A name that does not match its file.** The harness addresses an agent by the name in
its frontmatter and a person addresses it by the filename; when the two differ, one of
them is talking to nothing.

**A missing description.** The description is what decides whether an agent is selected
at all. Absent, the role exists and is never chosen — which reads exactly like a role
nobody needed.

**A non-orchestrator that can spawn agents.** An agent able to spawn another, in a roster
where that was not the intent, is an unbounded fan-out nobody planned and nobody sees
until the bill.

## The orchestrator list is yours

There is no universal answer to which roles may delegate. Naming them is the decision the
check exists to make visible; leaving the list empty forbids delegation entirely, which is
a legitimate and much simpler house rule.

## Refuse to

- let a role exist without a description, on the grounds that "everyone knows what it
  does" — the reader is a model choosing between fifteen of them;
- widen the orchestrator list to silence a finding. If a role should delegate, that is a
  decision worth making on purpose.
