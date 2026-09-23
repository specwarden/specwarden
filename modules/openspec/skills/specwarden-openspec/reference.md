<!-- GENERATED from modules/openspec/GUIDE.md. Edit the guide. -->

# @specwarden/openspec — guide

Reads an OpenSpec tree as the source of requirements and tasks, for repositories that
have one.

It is a MODULE and not part of the engine because an integration with somebody else's
tool cannot be a mandatory part of a quality harness: a repository that has never heard
of OpenSpec would still be carrying its layout assumptions, and every such assumption is
a thing that breaks when that tool ships a minor release.

## What the seam is for

SpecWarden answers a different question than a spec tool does — "does the decided thing
still hold", not "what to build" — so it shares the work rather than replacing it.
`specwarden sync-invariants` reads the requirements from here, finds the invariants
already deposited in the repository's own documents, and reconciles the two in both
directions:

- a requirement with no invariant yet → a proposed **deposit**;
- an invariant whose upstream requirement has vanished → an **orphan**, shown rather than
  silently kept.

It prints the proposed edit and **writes nothing**. A requirement's wording was written
for approval; turning it into a module invariant, read as truth about behaviour, is a
human's decision.

SpecWarden never writes into the OpenSpec tree. Reading it is the whole relationship.

## Install and wire

```bash
pnpm add -D @specwarden/openspec
```

```js
// .specwarden/warden.config.mjs
import { openspec } from '@specwarden/openspec';
import { defineConfig } from 'specwarden';

export default defineConfig({
  specSource: openspec(),
  invariants: { docs: 'src/**/*_MODULE.md', idPattern: /INV-([A-Z0-9-]+)/ },
});
```

Then:

```bash
specwarden sync-invariants
```

## What it reads

| Item         | Where                                                                         |
| ------------ | ----------------------------------------------------------------------------- |
| requirements | `openspec/specs/<capability>/spec.md`, headings matching `### Requirement: …` |
| tasks        | `openspec/changes/<change>/tasks.md`, checkbox lines                          |

A requirement's id is `<capability>#<slug-of-the-statement>`. Prefixed by the capability
deliberately: OpenSpec identifies a requirement by its wording, and two capabilities may
word one the same way.

## Options — every path, because layouts move

```js
openspec({
  root: 'openspec',
  specFile: 'spec.md',
  requirementHeading: /^#{2,4}\s+Requirement:\s*(.+?)\s*$/,
});
```

A tool that reorganises its layout in a minor release is the normal case, not the
exception. A memorised layout turns that into a source that finds nothing while reporting
success.

## The contract this adapter owes

**When it does not find what it expects, it says so** — `found: false` with a note naming
the directory it looked in. It does NOT return an empty list, because an empty list reads
as "nothing to do" and makes the reconciliation a check that cannot fail.

This was stated in the source while the code broke it: `requirements()` returned
`found: true` with nothing in it for any specs directory, so the sync printed
"0 requirements" and then "✓ in sync". A found-but-empty tree is now reported as one,
with a note suggesting `requirementHeading` if the OpenSpec version words them
differently.
