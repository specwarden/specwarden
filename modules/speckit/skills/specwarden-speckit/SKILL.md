---
name: specwarden-speckit
description: Use when a repository specifies its work with Spec Kit and the requirements must be reconciled with the invariants deposited in the code.
---

# specwarden-speckit

`@specwarden/speckit`

```js
// .specwarden/spec-source.mjs
import { speckit } from '@specwarden/speckit';

export const source = speckit({ root: 'specs' });
```

The seam is the same one the OpenSpec module fills, against the other tool — and it is
**singular by construction**: the config takes one `specSource`, because a second spec
tool is a second owner of one fact and the type refuses it rather than letting two copies
drift.

## Both halves, or neither

`specSource` says where requirements come from; `invariants` says how a deposited one
is recognised. With only one, `sync-invariants` reports every requirement as
undeposited — honest, and useless.

## What the reconciliation can and cannot tell you

It answers _which requirements have no invariant deposited against them_, and _which
markers point at a requirement that no longer exists_. It does not answer whether the
named test exists, whether it passes, or whether it asserts what the sentence claims.
Those belong to a reader, and a gate that implied otherwise would be the worst kind:
green, and about the wrong question.

## Refuse to

- run both spec modules at once. Pick the tool your repository actually specifies in;
- read a green `sync-invariants` as coverage.
