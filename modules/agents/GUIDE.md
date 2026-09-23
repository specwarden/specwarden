# @specwarden/agents — guide

One check over the role definitions a coding agent loads: their frontmatter, and who is
allowed to spawn another agent.

Wholly optional, and shaped by whichever assistant a house runs. A repository with no
roster does not install this module; one that does is checked where its roster is.

## Install and wire

```bash
pnpm add -D @specwarden/agents
```

```js
// .specwarden/checks/agents/agent-definitions.check.mjs
import { agentDefinitions } from '@specwarden/agents';

export const check = agentDefinitions({ id: 'agent-definitions', title: 'every agent declares its tools' });
```

It reads `.claude/agents` unless told otherwise. **A folder that does not exist is a
failure naming it** — it used to pass as "nothing to verify", and so did an `agentsDir`
left pointing at a roster that moved. A folder that exists and holds no definition yet
passes and says it read none.

## The two rules that are not cosmetic

**Omitting `tools:` does not restrict an agent — it inherits the whole session toolset.**
That is how a role described as a read-only reviewer silently gains Write, and nothing in
the definition says so. The field is required for exactly this reason.

**A leaf role that can spawn turns a bounded pipeline into an unbounded one**, where the
bill and the blast radius grow together. Only the roles named in `orchestrators` may
declare a spawn tool, and adding one is a decision about the pipeline's shape. The default
is `['lead']` — one conventional orchestrator; name yours, or pass `[]` to forbid
delegation entirely.

## The rest of the shape

- every definition carries the required frontmatter fields, non-empty
  (default: `name`, `description`, `tools`, `model`);
- `name` matches the filename. The harness addresses agents by name, so a mismatch is a
  definition that loads and is then uncallable — and the failure looks like a typo at the
  call site, nowhere near the file that caused it;
- a file in the agents folder with no frontmatter at all registers nothing.

## Options

```js
import { agentDefinitions } from '@specwarden/agents';

export const check = agentDefinitions({
  id: 'agent-definitions',
  title: 'every agent declares its tools, and only an orchestrator spawns',
  agentsDir: '.claude/agents',
  required: ['name', 'description', 'tools', 'model'],
  spawnTools: ['Task', 'Agent'],
  orchestrators: ['lead'],
});
```

| Option          | Kind                                | Default                                     |
| --------------- | ----------------------------------- | ------------------------------------------- |
| `agentsDir`     | directory                           | `.claude/agents`                            |
| `required`      | frontmatter fields                  | `['name', 'description', 'tools', 'model']` |
| `spawnTools`    | tool names that start another agent | `['Task', 'Agent']`                         |
| `orchestrators` | roles that may spawn                | `['lead']`                                  |

Beside these it takes the engine's identity — `id`, `title`, `tier` (default `fast`),
`when`, `hint`, `rule` — and refuses an option it does not have, by name, when the file
loads: `agents:` for `agentsDir` is a load error, not a crash inside the run.

`spawnTools` and `orchestrators` are both the host's: which tool starts another agent is
a fact about the assistant, and which role may use it is a fact about the pipeline.

## `parseFrontmatter`

Exported, because the frontmatter shape is worth reusing. It reads flat `key: value` with
folded `>` and `|` blocks — no nesting, no lists. A long description written as a folded
block comes back as one field; read wrong, it comes back empty and the check reports a
missing field that is plainly there.
