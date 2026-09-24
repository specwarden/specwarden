---
name: playgrounds
description: The three kinds of playground — inside each package, inside each template, and the one at the root — what each proves, and how to change one.
---

# playgrounds

## 1. One at the root; every other one inside its package

| Where                           | Question it answers                                                                                                               | Checks                        |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `<pkg>/_playground/`            | does THIS package work, imported by name, the way a consumer wires it                                                             | `package-playgrounds`, `unit` |
| `templates/<name>/_playground/` | does `init --template <name>` write a tree that is green over a real repository of its kind — and can every check it wrote go red | `playgrounds`, `unit`         |
| `_playgrounds/`                 | do ALL the packages work together, under one config, through the CLI                                                              | `package-playgrounds`, `unit` |

The root holds exactly one playground. A second folder there is how the per-package
suites started drifting to the root in the first place, and `package-playgrounds` refuses
one.

They are not tiers of one thing. A package playground passing says nothing about two
packages minting one check id; the root playground says nothing about what a template
writes into a consumer's repository; a green template says nothing about a factory that
was renamed. Each failure is invisible to the other two.

## 2. `<pkg>/_playground/` — the package, as a consumer wires it

A `playground.spec.ts`, and usually a `repository.ts` holding the fixture.

**It imports the package BY NAME**, through its own `exports` map — `@specwarden/docs`,
never a relative path into `src`. A unit suite imports by path, so it keeps passing over a
factory that was renamed and never re-exported from the barrel — the first thing a consumer
meets. The `package-playgrounds` check reads the import style, not just that the file exists.

**Every check runs twice** — over `CLEAN` and `BROKEN`. `BROKEN` carries one defect per
rule, each commented with the shape its check looks for. **One repository, not one per
check**: the checks read the same tree from several angles, and a fixture per check lets
those angles drift until the playground describes a repository nobody could have.

**The covered list is asserted against the barrel** through `uncoveredFactories`, which
tells a factory from a helper by what it RETURNS (a value carrying `id` and `run`). A list
kept by hand goes stale the first time a factory is added.

## 3. `templates/<name>/_playground/` — a consumer's repository, and the proof over it

```
templates/<name>/_playground/
  playground.spec.ts   calls provePlayground('<name>', defects, …)
  repository/          a repository of the kind the template is FOR
    .specwarden/       exactly what init --template <name> writes there — GENERATED
```

**The repository must be real.** `init` DETECTS what it writes for — no compose file, no
env-file check; no workflow, no CI-coverage check; no tracked shell, no shell check; no
`test` script, no test wrapper. The trees these replaced were `init` over a README and a
package.json: green because there was nothing to check, and with half of every template
switched off. Over real repositories, on the day they were written, the proofs found:

- the nestjs template red on every TypeORM service (an entity must import the ORM);
- `plan-shape` crashing on the agentic template's first plan;
- no documentation check reading a root `README.md` (the pathspec reading, `skills/testing`
  §3);
- the monorepo lockfile check verifying the lockfile of the repository ABOVE it.

**What the proof asserts** — `scripts/playground-proof.mjs`, written once:

1. green under `check --all` with nothing edited after `init`, no check skipped;
2. a defect listed for every check the template wrote, and for no check it did not — a new
   part cannot land without a scene showing it fail;
3. each defect, planted ALONE, turns exactly its own check red and nothing else, with a
   finding naming what was planted.

A template whose distinctive part is not a check adds scenes of its own through
`inScratchRepository`: the agentic perimeter fed PreToolUse payloads, `sync-invariants` over
the OpenSpec and Spec Kit trees.

**Every run is the real CLI over a scratch git repository.** A check reads TRACKED files, so
a run in place would answer differently before and after somebody's `git add`. The scratch
copy links exactly what installing the template brings — the template and its own
dependencies — so a generated check importing a module the template never declared fails
here as it would for a consumer. A pnpm workspace is installed by pnpm instead: it declares
the engine with `link:` paths relative to where it is committed, and the proof rebases
them onto the scratch copy and installs offline.

**Why committed, not produced in a temp directory.** A template emits STRINGS, and no
compiler reads a string. Committed, the tree is in the diff, and "this template now writes a
check nobody asked for" is a review comment rather than an archaeology exercise. The
`playgrounds` check holds the committed `.specwarden/` to what `init` writes today.

**Changing one.** Change the template, `pnpm --filter @specwarden/template-<name> build`,
then `node scripts/playgrounds.mjs --write <name>`, and review the `.specwarden/` diff. The
repository around it is a hand-written fixture; edit it directly, then regenerate, because
what it contains decides what `init` writes.

## 4. `_playgrounds/` — every package, composed

A private workspace package, `@specwarden-playgrounds/workspace`, that DECLARES every
published package in its manifest — so it resolves them through their own `exports`, not
through the root's hoisting.

- `playground.spec.ts` builds one `defineConfig` naming every package and runs the roster
  and the runner in-process: no two packages mint one id, a plugin's checks reach the
  roster, every check speaks the current contract version.
- `cli.spec.ts` writes the same config as FILES — `consumer/` becomes the scratch
  repository's `.specwarden/` — and runs the CLI: discovery, loading from installed
  packages, the plugin registered from the config.

Both assert the same two lists in `repository.ts` — every check id, and exactly what the
broken tree turns red — so the two ways of composing cannot describe different configs.

## 5. The traps, in every kind

- **The empty pathspec** means every tracked file to git; forwarded to a glob it matches
  nothing, and a credential scan passed over a tree with a credential in it.
- **A defect that plants nothing** — use `planted()`.
- **A default shell that is not the one you think.** On Windows a bare `bash` may be
  WSL's, where the Windows `node` does not exist. The engine resolves Git's own bash for a
  command check (`resolveShell`; `SPECWARDEN_SHELL` overrides it), and the proof arranges
  nothing about the PATH — a playground run from PowerShell is what proves that.
