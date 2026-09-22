---
name: structure
description: Which package a thing belongs in, which folder, which file — and the one dependency direction that must never reverse.
---

# structure

## 1. Which package

**If a check could be WRONG about a repository that has never heard of it, it is an
opinion and it ships as a module.**

That is the whole taxonomy. A documentation layout, a plan lifecycle, a compose file, a
vendor's credential format — each is a house's decision, and a house that disagrees
should not inherit it. Zones, ratchets, the rule register and the runner are the engine's
own mechanics, and nothing else can own them.

| Kind       | Directory           | Answers                                                              |
| ---------- | ------------------- | -------------------------------------------------------------------- |
| `core`     | `core/`             | how a check is run, gated, filtered, ratcheted and reported          |
| `module`   | `modules/<name>/`   | one opinion a repository may choose                                  |
| `plugin`   | `plugins/<name>/`   | one stack's conventions, in that stack's vocabulary                  |
| `template` | `templates/<name>/` | which checks are worth having on day one, for one kind of repository |
| `scaffold` | `templates/_parts/` | the pieces a template is assembled from                              |

The engine once held nineteen checks and every consumer inherited all nineteen —
including five vendor credential formats it might not use. None of it was wrong; all of
it was somebody else's opinion arriving unasked. That is why `modules/` exists.

## 2. The dependency direction

**Everything depends on `core`; `core` depends on nothing.**

One-way and total. A module, a plugin and a template import the engine. The engine
imports none of them, and a lint rule fails the build if it starts to — because the day
it does, installing the engine starts installing an opinion, and nothing else would
notice: the import resolves, the tests pass, and the coupling shows up months later as a
consumer wondering why a quality-gate runner pulled in a documentation checker.

A module does not import another module either. Two modules that need the same thing
either both get it from the engine, or it was never a module's to own.

## 3. Inside a package

```
<pkg>/
  src/
    index.ts                 the ONE entry point — see rule 4
    <unit>/<unit>.<role>.ts  one exported subject per file, in its own folder
    <unit>/<unit>.<role>.spec.ts
    _shared/                 mechanics several units need; never a subject
  skills/<skill-name>/       what SHIPS, when the package declares a skill
  GUIDE.md  README.md  SKILL.md  LICENSE
```

**Folder per tested unit.** A file with a subject sits in a folder named after it, with
its spec beside it. The folder is what lets a unit be read, moved or deleted on its own;
a flat directory of forty files is one where nothing can be.

**`_shared/` holds mechanics, never knowledge.** A helper that knows what is being
checked belongs to the check. The underscore means "not a subject": nothing in it is
part of the package's answer to anything, and a reader looking for behaviour can skip the
whole folder.

**A role suffix says what a file IS**: `.model.ts` for types and pure functions,
`.check.ts` for a check factory, `.adapter.ts` for a port implementation, `.util.ts` for
mechanics, `.service.ts` for something with lifecycle, `.spec.ts` for a test. Two files
of the same role in one folder is a folder holding two subjects.

## 4. One entry point

Every package publishes exactly `.` and nothing else. The moment a subpath is exported,
the first consumer reaches for an internal and it becomes unremovable.

The engine's own `public-surface.spec.ts` pins this, and it is a deliberate departure
from what a framework would do: a framework's consumer wants `pkg/subsystem`, a harness's
consumer wants one import and a config file.

## 5. Adding a package

1. an entry in `scripts/registry.mjs` — kind, description, summary, deps;
2. `pnpm scaffold` — the manifest, the tsconfig, the build config, the README and the
   licence are written for you;
3. `src/index.ts` and the code;
4. a changeset, when it is user-visible.

Do **not** hand-write a `package.json`. It is generated, `pnpm check:drift` fails when it
disagrees with the registry, and the next `pnpm scaffold` reverts the edit anyway.
