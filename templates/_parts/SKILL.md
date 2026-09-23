---
name: maintaining-templates
description: What may not change in the templates and the parts they are assembled from — read before editing a template.
---

# Maintaining the templates

Eight templates, assembled from the parts in this package. They publish **strings**, not
an API, which is the fact everything below follows from.

There is no `GUIDE.md` here and no shipped skill: a template is consumed by one command
(`specwarden init --template <name>`), and the skill for reasoning about what that
command wrote is the engine's.

## Invariants

1. **No compiler reads a string.** A module option renamed anywhere leaves every template
   compiling happily and producing a tree that throws on its first run — and the first
   run is what decides whether the tool is kept. This is why the scaffolded trees are
   committed under `_playgrounds/` and run: see
   [`skills/playgrounds/SKILL.md`](../../skills/playgrounds/SKILL.md) §4.

2. **A template writes a part only where its subject exists.** `init` detects what it is
   writing for. A template that writes a documentation check into a repository with no
   documents produces a tree that is red on arrival, which is the same outcome as writing
   nothing, minus the trust.

3. **A tree a template writes must be GREEN on its first run, with nothing edited.** That
   is the only promise a consumer feels on day one. It is checked, not hoped for.

4. **A template never writes a path it does not create.** The scaffolded `.specwarden/`
   README is read by the consumer's own `doc-paths` check the moment they run it. An
   illustrative path must be written as a folder and a filename, never as
   `dir/file.ext` — this has already failed four playgrounds at once.

5. **A template declares the packages its checks import.** `init` refuses to write a tree
   whose repository has not declared them, because such a tree fails on its first run and
   refusing is more useful than producing it. The playground seeds are generated from the
   registry for the same reason.

## Changing a template

You do not edit a playground; you edit the template and regenerate:

```bash
node scripts/playgrounds.mjs --write
```

Then review the diff — "this template now writes a check nobody asked for" is a review
comment rather than an archaeology exercise, which is the entire argument for committing
the trees.

Manifests, build configs and READMEs in this workspace are DERIVED from
`scripts/registry.mjs`. Edit the registry and run `pnpm scaffold`; a direct edit to a
generated file does not survive, deliberately.

## What belongs somewhere else

- A CHECK belongs in the engine or a module. A template only wires checks that already
  exist.
- A convention about this repository's own code is [`skills/`](../../skills/).
