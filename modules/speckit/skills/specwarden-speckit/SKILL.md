---
name: specwarden-speckit
description: Use when a repository specifies its work with Spec Kit and the requirements must be reconciled with the invariants deposited in the code.
---

# specwarden-speckit

`@specwarden/speckit`

## When to reach for it

The repository writes its requirements with Spec Kit — `specs/<feature>/spec.md` lines like
`- **FR-001**: the system MUST …` — and each requirement that matters should have an
invariant deposited in the code's own documents. `specwarden sync-invariants` reconciles the
two in both directions, and writes nothing.

## The wiring

```js
// .specwarden/spec-source.mjs
import { speckit } from '@specwarden/speckit';

export const source = speckit();
```

```js
// .specwarden/config.mjs
import { defineConfig } from 'specwarden';

import { source } from './spec-source.mjs';

export default defineConfig({
  specSource: source,
  invariants: { docs: 'src/**/*_MODULE.md', idPattern: /<!--\s*invariant:\s*([^\s>]+)\s*-->/ },
});
```

The defaults read `specs/<feature>/spec.md` and `tasks.md`; `featuresDir`, `specFile`,
`tasksFile` and `requirementPattern` (capturing the id, then the statement) move them.

A deposit is `<!-- invariant: 001-invites#FR-001 -->` — the requirement's FULL id, feature
prefix included, exactly as `sync-invariants` prints it. A pattern that captures a
shorter local number can never match one, and the reconciliation never reaches "in sync".

The seam is the same one the OpenSpec module fills, against the other tool — and it is
**singular by construction**: the config takes one `specSource`, because a second spec
tool is a second owner of one fact and the type refuses it rather than letting two copies
drift.

### Both halves, or neither

`specSource` says where requirements come from; `invariants` says how a deposited one
is recognised. With only one, `sync-invariants` reports every requirement as
undeposited — honest, and useless.

### What the reconciliation can and cannot tell you

It answers _which requirements have no invariant deposited against them_, and _which
markers point at a requirement that no longer exists_. It does not answer whether the
named test exists, whether it passes, or whether it asserts what the sentence claims.
Those belong to a reader, and a check that implied otherwise would be the worst kind:
green, and about the wrong question.

## What it refuses

At load, by name: an option it does not have (`root` — the old spelling), any of a check's
identity (`id`, `tier`, `rule` — a source is not a check), an empty path, and a pattern
given as a string. At run time it never answers an empty list for a tree it could not find:
`found: false`, with a note naming `featuresDir`.

## Refuse to

- run both spec modules at once. Pick the tool your repository actually specifies in;
- read a green `sync-invariants` as coverage.
