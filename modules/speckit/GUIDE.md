# @specwarden/speckit — guide

Reads a Spec Kit tree as the source of requirements and tasks, for repositories that have
one.

It is the **third** implementation of the engine's `ISpecSource` port, and the one that
shows the port carries its weight. Two adapters can share an accident; three cannot.
OpenSpec keeps tasks under `changes/<change>/tasks.md` and has no machine-readable
requirements at all, Spec Kit keeps both under `specs/<feature>/`, and the native source
reads a repository's own documents — yet all three answer the same two questions, which
is what makes "bring your own spec tool" a real offer rather than a claim.

## Install and wire

```bash
pnpm add -D @specwarden/speckit
```

```js
// .specwarden/warden.config.mjs
import { speckit } from '@specwarden/speckit';
import { defineConfig } from 'specwarden';

export default defineConfig({
  specSource: speckit(),
  invariants: { docs: 'src/**/*_MODULE.md', idPattern: /<!--\s*invariant:\s*([^\s>]+)\s*-->/ },
});
```

A deposit is a marker carrying the requirement's full id — the one `sync-invariants`
prints on its `+` line — in a document `docs` reads:

```markdown
<!-- invariant: 001-invites#FR-001 -->

An invite expires after seven days. Pinned by `invites.spec.ts` -> "expires an invite".
```

`idPattern`'s first capture group must yield that id exactly. A pattern capturing a
shorter local number (`INV-…`) can never equal `001-invites#FR-001`, so the reconciliation
would never reach "in sync".

Then `specwarden sync-invariants` reconciles the requirements against the invariants
already deposited in the repository's own documents, in both directions, and writes
nothing — see [the OpenSpec guide](../openspec/GUIDE.md) for what the seam is for, which
is identical.

## What it reads

| Item         | Where                                                                   |
| ------------ | ----------------------------------------------------------------------- |
| requirements | `specs/<feature>/spec.md`, lines like `- **FR-001**: the system MUST …` |
| tasks        | `specs/<feature>/tasks.md`, checkbox lines                              |

The requirement line is matched loosely on purpose: the **id** is what matters, and the
statement is carried through untranslated. Attaching proof is this engine's job;
rewording another tool's requirement is not.

An id keeps its upstream spelling, prefixed by its feature — `001-invites#FR-001`. Two
features both numbering from `FR-001` is the normal case, and without the prefix they
collapse into one id and the second requirement silently stops existing.

## Options

```js
// .specwarden/spec-source.mjs
import { speckit } from '@specwarden/speckit';

export const source = speckit({ root: 'specs', specFile: 'spec.md', tasksFile: 'tasks.md' });
```

| Option      | Kind                         | Default    |
| ----------- | ---------------------------- | ---------- |
| `root`      | directory                    | `specs`    |
| `specFile`  | filename inside each feature | `spec.md`  |
| `tasksFile` | filename inside each feature | `tasks.md` |

Every path is an option, because a tool that reorganises its layout in a minor release is
the normal case rather than the exception. A repository that moved its features says so
here instead of discovering the silence later. An option the factory does not have is
refused by name when the config loads.

## The contract this adapter owes

A missing tree is reported as `found: false` with a note naming what was looked for and
which option would fix it — never as an empty list. An empty list reads as "nothing to
do", and the reconciliation then prints agreement about a tree it never read.

SpecWarden never writes into the Spec Kit tree.
