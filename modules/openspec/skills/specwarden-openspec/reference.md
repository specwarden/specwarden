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
  invariants: { docs: 'src/**/*_MODULE.md', idPattern: /<!--\s*invariant:\s*([^\s>]+)\s*-->/ },
});
```

Then:

```bash
specwarden sync-invariants
```

## Depositing an invariant

`sync-invariants` names each requirement by its full id — `auth#the-system-shall-refuse-an-expired-token`
— and a deposit is recognised only when its marker carries **that id, exactly**. So the
marker holds the adapter's id, and `idPattern` captures everything up to the closing
`-->`:

```markdown
<!-- invariant: auth#the-system-shall-refuse-an-expired-token -->

An expired token is refused. Pinned by `auth.spec.ts` -> "rejects an expired token".
```

A pattern that captures anything shorter — a local `INV-…` number, say — can never equal
an OpenSpec id: every requirement reads as undeposited and every marker as an orphan, and
the reconciliation never reaches "in sync". Copy the id from the `+` line the sync
prints; a reworded requirement gets a new id, and its old marker is then reported as an
orphan, which is the point.

| `invariants` key | Kind                                            | Example                                 |
| ---------------- | ----------------------------------------------- | --------------------------------------- |
| `docs`           | glob over the documents that carry deposits     | `src/**/*_MODULE.md`                    |
| `idPattern`      | RegExp whose FIRST capture group is the full id | `/<!--\s*invariant:\s*([^\s>]+)\s*-->/` |

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
// .specwarden/spec-source.mjs
import { openspec } from '@specwarden/openspec';

export const source = openspec({
  root: 'openspec',
  specFile: 'spec.md',
  requirementHeading: /^#{2,4}\s+Requirement:\s*(.+?)\s*$/,
});
```

| Option               | Kind                                       | Default                                  |
| -------------------- | ------------------------------------------ | ---------------------------------------- |
| `root`               | directory                                  | `openspec`                               |
| `specFile`           | filename inside each capability            | `spec.md`                                |
| `requirementHeading` | RegExp capturing the requirement's wording | `### Requirement: …`, levels two to four |

A tool that reorganises its layout in a minor release is the normal case, not the
exception. A memorised layout turns that into a source that finds nothing while reporting
success. An option the factory does not have is refused by name when the config loads.

## The contract this adapter owes

**When it does not find what it expects, it says so** — `found: false` with a note naming
the directory it looked in. It does NOT return an empty list, because an empty list reads
as "nothing to do" and makes the reconciliation a check that cannot fail.

This was stated in the source while the code broke it: `requirements()` returned
`found: true` with nothing in it for any specs directory, so the sync printed
"0 requirements" and then "✓ in sync". A found-but-empty tree is now reported as one,
with a note suggesting `requirementHeading` if the OpenSpec version words them
differently.
