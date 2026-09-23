---
name: specwarden-openspec
description: Use when a repository specifies its work with OpenSpec and the requirements must be reconciled with the invariants deposited in the code.
---

# specwarden-openspec

`@specwarden/openspec`

```js
// .specwarden/spec-source.mjs
import { openspec } from '@specwarden/openspec';

export const source = openspec({ root: 'openspec' });
```

```js
// .specwarden/warden.config.mjs
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

## Both halves, or neither

`specSource` says where requirements come from. `invariants` says how a deposited one
is recognised in the corpus. **With only one of them, `sync-invariants` reports every
requirement as undeposited** — honest, and useless.

A green `sync-invariants` is not evidence either: what decides is a gate over the corpus.

## The marker carries the adapter's id, exactly

The adapter names a requirement `<capability>#<slug-of-its-wording>` —
`auth#the-system-shall-refuse-an-expired-token` — and `sync-invariants` prints that id on
each `+` line. A deposit is recognised only when `idPattern`'s first capture group yields
that string, so the marker is written with it:

```markdown
<!-- invariant: auth#the-system-shall-refuse-an-expired-token -->
```

A pattern that captures a shorter, local number (`INV-…`, `AUTH-001`) can never match: every
requirement reads as undeposited and every marker as an orphan, forever.

## The identifier must be PERMANENT

The shipped adapter derives a requirement's id from its wording, which means a reword
silently orphans the invariant already deposited against it. If your corpus can afford
permanent ids, give them permanent ids and write a local source that reads them — the
seam takes any `ISpecSource`, and this is the one decision worth making before the
corpus is large.

## A deposit says what pins it

A marker with no pinning sentence reads exactly like coverage. `Pinned by <spec> ->
"<assertion>"` or `not pinned by a test — <reason>`: the second is a legitimate answer,
silence is not.

## Refuse to

- declare a spec source without the invariant pattern, or the reverse;
- write a marker with any id but the one `sync-invariants` printed;
- treat a green `sync-invariants` as evidence of anything.
