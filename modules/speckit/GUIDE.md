# @specwarden/speckit — guide

Reads a Spec Kit tree as the spec source — where requirements and tasks come from — for
repositories that have one.

It is the **third** implementation of the engine's `ISpecSource` port, and the one that
shows the port carries its weight. Two adapters can share an accident; three cannot.
OpenSpec keeps tasks under `changes/<change>/tasks.md`, Spec Kit keeps both under
`specs/<feature>/`, and the native source reads a repository's own documents — yet all
three answer the same two questions, which is what makes "bring your own spec tool" a real
offer rather than a claim.

## What it catches

`specwarden sync-invariants` reconciles the requirements read here against the invariants
already deposited in the repository's own documents, in both directions, and writes
nothing — see [the OpenSpec guide](../openspec/GUIDE.md) for what the seam is for, which
is identical.

| Item         | Where                                                                   |
| ------------ | ----------------------------------------------------------------------- |
| requirements | `specs/<feature>/spec.md`, lines like `- **FR-001**: the system MUST …` |
| tasks        | `specs/<feature>/tasks.md`, checkbox lines                              |

The requirement line is matched loosely on purpose: the **id** is what matters, and the
statement is carried through untranslated. Attaching proof is this engine's job; rewording
another tool's requirement is not.

An id keeps its upstream spelling, prefixed by its feature — `001-invites#FR-001`. Two
features both numbering from `FR-001` is the normal case, and without the prefix they
collapse into one id and the second requirement silently stops existing.

## Wiring

```bash
pnpm add -D @specwarden/speckit
```

```js
// .specwarden/config.mjs
import { speckit } from '@specwarden/speckit';
import { defineConfig } from 'specwarden';

export default defineConfig({
  specSource: speckit(),
  invariants: { docs: 'src/**/*_MODULE.md', idPattern: /<!--\s*invariant:\s*([^\s>]+)\s*-->/ },
});
```

A deposit is a marker carrying the requirement's full id — the one `sync-invariants` prints
on its `+` line — in a document `docs` reads:

```markdown
<!-- invariant: 001-invites#FR-001 -->

An invite expires after seven days. Pinned by `invites.spec.ts` -> "expires an invite".
```

`idPattern`'s first capture group must yield that id exactly. A pattern capturing a shorter
local number (`INV-…`) can never equal `001-invites#FR-001`, so the reconciliation would
never reach "in sync".

## Options

Every path is an option, and so is the requirement grammar — a tool that reorganises its
layout in a minor release is the normal case rather than the exception:

```js
// .specwarden/spec-source.mjs
import { speckit } from '@specwarden/speckit';

export const source = speckit({
  featuresDir: '.specify/features',
  requirementPattern: /^\|\s*(REQ-\d+)\s*\|\s*(.+?)\s*\|$/,
});
```

| Option               | Kind                                        | Default                                          |
| -------------------- | ------------------------------------------- | ------------------------------------------------ |
| `featuresDir`        | directory of feature folders                | `specs`                                          |
| `specFile`           | filename inside each feature                | `spec.md`                                        |
| `tasksFile`          | filename inside each feature                | `tasks.md`                                       |
| `requirementPattern` | RegExp capturing the id, then the statement | `DEFAULT_REQUIREMENT_PATTERN`: `- **FR-001**: …` |

A source is not a check, so it takes none of a check's identity: `id`, `tier`, `rule` and
the rest are refused by name, as are an option it does not have, an empty path and a
pattern given as a string — when the config loads. A pattern written with `g` is read
statelessly, so it reads every line rather than every second one.

## What fails and what passes

A missing tree is reported as `found: false` with a note naming what was looked for and the
option that moves it — never as an empty list. An empty list reads as "nothing to do", and
the reconciliation then prints agreement about a tree it never read. A tree that is there
and holds no requirement line is found, empty, and says so — suggesting
`requirementPattern` if the repository numbers them differently. Nothing is ever written
into the Spec Kit tree.
