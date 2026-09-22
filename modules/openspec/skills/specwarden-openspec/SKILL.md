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
import { source } from './spec-source.mjs';

export default defineConfig({
  specSource: source,
  invariants: {
    docs: '**/*.md',
    idPattern: /<!--\s*invariant:\s*([A-Z][A-Z0-9]*-\d{3})\s*-->/g,
  },
});
```

## Both halves, or neither

`specSource` says where requirements come from. `invariants` says how a deposited one
is recognised in the corpus. **With only one of them, `sync-invariants` reports every
requirement as undeposited** — honest, and useless.

A green `sync-invariants` is not evidence either: it returns 0 in every branch by
design, including when it found no source at all. What decides is a gate over the corpus.

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
- treat a green `sync-invariants` as evidence of anything.
