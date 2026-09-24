# @specwarden/agents — guide

One check, `agent-definitions`, over the role definitions a coding agent loads: their
frontmatter, and who is allowed to spawn another agent. Wholly optional, and shaped by
whichever assistant a consumer runs.

## What it catches

**Omitting `tools:` does not restrict an agent — it inherits the whole session toolset.**
That is how a role described as a read-only reviewer silently gains Write, and nothing in
the definition says so. The field is required for exactly this reason.

**A leaf role that can spawn turns a bounded pipeline into an unbounded one**, where the
bill and the blast radius grow together. Only the roles named in `orchestrators` may
declare a spawn tool, and adding one is a decision about the pipeline's shape.
`orchestrators` defaults to `['lead']` — one conventional orchestrator; name yours, or pass
`[]` to forbid delegation entirely.

And the rest of the shape:

- every definition carries the required frontmatter fields, non-empty;
- `name` matches the filename. An assistant addresses agents by name, so a mismatch is a
  definition that loads and is then uncallable — and the failure looks like a typo at the
  call site, nowhere near the file that caused it;
- a file in the agents folder with no frontmatter at all registers nothing.

## Wiring

```bash
pnpm add -D @specwarden/agents
```

```js
// .specwarden/checks/agents/agent-definitions.check.mjs
import { agentDefinitions } from '@specwarden/agents';

export const check = agentDefinitions();
```

It reads `.claude/agents`, its id is `agent-definitions`, and it carries the rule the
package implies, owned by `@specwarden/agents`. Name only what differs — a roster somewhere
else, your own orchestrators:

```js
import { agentDefinitions } from '@specwarden/agents';

export const check = agentDefinitions({ agentsDir: 'agents', orchestrators: ['lead', 'planner'] });
```

## Options

| Option          | Kind                                | Default                                     |
| --------------- | ----------------------------------- | ------------------------------------------- |
| `agentsDir`     | directory                           | `.claude/agents`                            |
| `required`      | frontmatter fields                  | `['name', 'description', 'tools', 'model']` |
| `spawnTools`    | tool names that start another agent | `['Task', 'Agent']`                         |
| `orchestrators` | roles that may spawn; `[]` for none | `['lead']`                                  |
| `corpus`        | `{ atLeast, why }`                  | `{ atLeast: 1 }`                            |

Beside these it takes the engine's identity — `id`, `title`, `tier` (default `fast`),
`when`, `hint`, `advisory`, `rule`, `ratchet` — and refuses an option it does not have, an
empty `agentsDir`, `required` or `spawnTools`, a value of the wrong kind, and `zone`, by
name, when the file loads: `agents:` for `agentsDir` is a load error, not a crash inside
the run. `spawnTools` and `orchestrators` are both yours: which tool starts another
agent is a fact about the assistant, and which role may use it is a fact about the
pipeline.

## What fails and what passes

- Each defect above fails, one finding per definition and rule, carrying the file and the
  line of the field it is about.
- **A roster that is not where `agentsDir` says fails** — a folder that does not exist, a
  file at that path, or a folder with no `.md` definition in it. Each used to pass as
  "nothing to verify", and so did an `agentsDir` left pointing at a roster that moved. A
  folder made before its first role declares `corpus: { atLeast: 0 }`.
- A clean pass says what it read: `✓ agent-definitions — 12 agent definition(s) examined, clean`.
- `ratchet: n` tolerates the `n` findings a roster already has and fails on one more.

`parseFrontmatter` is exported, because the frontmatter shape is worth reusing. It reads
flat `key: value` with folded `>` and `|` blocks — no nesting, no lists. A long description
written as a folded block comes back as one field; read wrong, it comes back empty and the
check reports a missing field that is plainly there.
