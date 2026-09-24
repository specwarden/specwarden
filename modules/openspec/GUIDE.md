# @specwarden/openspec — guide

Reads an OpenSpec tree as the spec source — where requirements and tasks come from — for
repositories that have one. It is a module and not the engine because an integration with
somebody else's tool cannot be a mandatory part of a quality check: a repository that has
never heard of OpenSpec would still carry its layout assumptions, and each one breaks when
that tool ships a minor release.

## What it catches

specwarden answers a different question than a spec tool does — "does the decided thing
still hold", not "what to build" — so it shares the work rather than replacing it.
`specwarden sync-invariants` reads the requirements from here, finds the invariants
already deposited in the repository's own documents, and reconciles the two in both
directions:

- a requirement with no invariant yet → a proposed **deposit**;
- an invariant whose upstream requirement has vanished → an **orphan**, shown rather than
  silently kept.

It prints the proposed edit and **writes nothing**. A requirement's wording was written
for approval; turning it into a module invariant, read as truth about behaviour, is a
human's decision. Nothing is ever written into the OpenSpec tree either.

| Item         | Where                                                                         |
| ------------ | ----------------------------------------------------------------------------- |
| requirements | `openspec/specs/<capability>/spec.md`, headings matching `### Requirement: …` |
| tasks        | `openspec/changes/<change>/tasks.md`, checkbox lines                          |

A requirement's id is `<capability>#<slug-of-the-statement>`. Prefixed by the capability
deliberately: OpenSpec identifies a requirement by its wording, and two capabilities may
word one the same way.

## Wiring

```bash
pnpm add -D @specwarden/openspec
```

```js
// .specwarden/config.mjs
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

`sync-invariants` names each requirement by its full id —
`auth#the-system-shall-refuse-an-expired-token` — and a deposit is recognised only when its
marker carries **that id, exactly**. So the marker holds the adapter's id, and `idPattern`
captures everything up to the closing `-->`:

```markdown
<!-- invariant: auth#the-system-shall-refuse-an-expired-token -->

An expired token is refused. Pinned by `auth.spec.ts` -> "rejects an expired token".
```

A pattern that captures anything shorter — a local `INV-…` number, say — can never equal
an OpenSpec id: every requirement reads as undeposited and every marker as an orphan, and
the reconciliation never reaches "in sync". Copy the id from the `+` line the sync prints;
a reworded requirement gets a new id, and its old marker is then reported as an orphan,
which is the point.

| `invariants` key | Kind                                            | Example                                 |
| ---------------- | ----------------------------------------------- | --------------------------------------- |
| `docs`           | glob over the documents that carry deposits     | `src/**/*_MODULE.md`                    |
| `idPattern`      | RegExp whose FIRST capture group is the full id | `/<!--\s*invariant:\s*([^\s>]+)\s*-->/` |

## Options

Every path is an option, because layouts move:

| Option               | Kind                                  | Default                                                                 |
| -------------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| `specsDir`           | directory of capability folders       | `openspec/specs`                                                        |
| `changesDir`         | directory of change folders           | `openspec/changes`                                                      |
| `specFile`           | filename inside each capability       | `spec.md`                                                               |
| `tasksFile`          | filename inside each change           | `tasks.md`                                                              |
| `requirementPattern` | RegExp capturing the requirement text | `DEFAULT_REQUIREMENT_PATTERN`: `### Requirement: …`, levels two to four |

A source is not a check, so it takes none of a check's identity: `id`, `tier`, `rule` and
the rest are refused by name, as are an option it does not have, an empty path and a
pattern given as a string — when the config loads. A pattern written with `g` is read
statelessly, so it reads every line rather than every second one.

## What fails and what passes

**When it does not find what it expects, it says so** — `found: false`, with a note naming
the directory it looked in and the option that moves it. It does NOT return an empty list,
because an empty list reads as "nothing to do" and makes the reconciliation a check that
cannot fail.

This was stated in the source while the code broke it: `requirements()` returned
`found: true` with nothing in it for any specs directory, so the sync printed
"0 requirements" and then "✓ in sync". A found-but-empty tree is now reported as one, with
a note suggesting `requirementPattern` if the OpenSpec version words them differently; a
changes folder with no task checkbox says so too.
