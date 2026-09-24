---
name: specwarden-openspec
description: Use when a repository specifies its work with OpenSpec and the requirements must be reconciled with the invariants deposited in the code.
---

# specwarden-openspec

`@specwarden/openspec`

## When to reach for it

The repository writes its requirements with OpenSpec, and each requirement that matters
should have an invariant deposited in the code's own documents. `specwarden
sync-invariants` reconciles the two in both directions — a requirement with no deposit, a
deposit whose requirement vanished — and writes nothing.

## The wiring

```js
// .specwarden/spec-source.mjs
import { openspec } from '@specwarden/openspec';

export const source = openspec();
```

```js
// .specwarden/config.mjs
import { defineConfig } from 'specwarden';

import { source } from './spec-source.mjs';

export default defineConfig({
  specSource: source,
  invariants: {
    docs: 'src/**/*_MODULE.md',
    idPattern: /<!--\s*invariant:\s*([^\s>]+)\s*-->/,
  },
});
```

The defaults read `openspec/specs/<capability>/spec.md` and
`openspec/changes/<change>/tasks.md`. Every path is an option — `specsDir`, `changesDir`,
`specFile`, `tasksFile` — and so is the heading grammar, `requirementPattern`.

**Both halves, or neither.** `specSource` says where requirements come from. `invariants`
says how a deposited one is recognised in the corpus. With only one of them,
`sync-invariants` reports every requirement as undeposited — honest, and useless.

**The marker carries the adapter's id, exactly.** The adapter names a requirement
`<capability>#<slug-of-its-wording>` — `auth#the-system-shall-refuse-an-expired-token` —
and `sync-invariants` prints that id on each `+` line. A deposit is recognised only when
`idPattern`'s first capture group yields that string:

```markdown
<!-- invariant: auth#the-system-shall-refuse-an-expired-token -->
```

A pattern that captures a shorter, local number (`INV-…`, `AUTH-001`) can never match: every
requirement reads as undeposited and every marker as an orphan, forever.

**The identifier must be PERMANENT.** The shipped adapter derives a requirement's id from
its wording, so a reword orphans the invariant already deposited against it. If your corpus
can afford permanent ids, write a local source that reads them — the seam takes any
`ISpecSource` — before the corpus is large.

**A deposit says what pins it.** `Pinned by <spec> -> "<assertion>"` or `not pinned by a
test — <reason>`: the second is a legitimate answer, silence is not.

## What it refuses

At load, by name: an option it does not have (`root`, `requirementHeading` — the old
spellings), any of a check's identity (`id`, `tier`, `rule` — a source is not a check), an
empty path, and a pattern given as a string. At run time it never answers an empty list
for a tree it could not find: `found: false`, with a note naming the option that moves it.

## Refuse to

- declare a spec source without the invariant pattern, or the reverse;
- write a marker with any id but the one `sync-invariants` printed;
- treat a green `sync-invariants` as evidence of anything — what decides is a check over
  the corpus.
